import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const ACCULYNX_API = 'https://api.acculynx.com/api/v2';
const DELAY_MS = 1200;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getApiKey() {
  const apiKey = Deno.env.get('ACCULYNX_API_KEY');
  if (!apiKey) throw new Error('ACCULYNX_API_KEY secret is not set');
  return apiKey;
}

function authHeaders() {
  return {
    accept: 'application/json',
    Authorization: `Bearer ${getApiKey()}`,
  };
}

async function acculynxGet(path, attempt = 0) {
  const response = await fetch(`${ACCULYNX_API}${path}`, {
    headers: authHeaders(),
    signal: AbortSignal.timeout(15000),
  });

  if (response.status === 429 && attempt < 6) {
    const retryAfterSeconds = Number(response.headers.get('retry-after') || 0);
    const waitMs = retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : 3000 * (attempt + 1);
    await sleep(waitMs);
    return acculynxGet(path, attempt + 1);
  }

  if (response.status >= 500 && attempt < 4) {
    await sleep(2000 * (attempt + 1));
    return acculynxGet(path, attempt + 1);
  }

  if (!response.ok) {
    throw new Error(`AccuLynx ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  await sleep(DELAY_MS);
  return data;
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function toDateString(value) {
  if (!value) return '';
  return String(value).split('T')[0];
}

function toPercent(value) {
  const num = toNumber(value);
  if (!num) return 0;
  return num <= 1 ? num * 100 : num;
}

function normalizeStatus(value) {
  const raw = String(value || '').toLowerCase();
  if (raw.includes('accept') || raw.includes('approv')) return 'accepted';
  if (raw.includes('declin') || raw.includes('reject')) return 'declined';
  if (raw.includes('revis')) return 'revised';
  if (raw.includes('sent') || raw.includes('view')) return 'sent';
  return 'draft';
}

function normalizeUnit(value) {
  if (!value) return 'EA';
  if (typeof value === 'string') return value.toUpperCase();
  return String(value.abbreviation || value.code || value.name || 'EA').toUpperCase();
}

function getFinancials(detail) {
  return detail?.financials || detail?.financial || detail?.estimateFinancial || {};
}

function getFinancialId(detail) {
  return detail?.financials?.id || detail?.financialId || detail?.financial?.id || detail?.estimateFinancial?.id || null;
}

function getWorksheetSections(payload) {
  if (Array.isArray(payload?.sections)) return payload.sections;
  if (Array.isArray(payload?.data?.sections)) return payload.data.sections;
  if (Array.isArray(payload?.worksheetSections)) return payload.worksheetSections;
  if (Array.isArray(payload?.data?.worksheetSections)) return payload.data.worksheetSections;
  return [];
}

function getSectionItems(section) {
  if (Array.isArray(section?.items)) return section.items;
  if (Array.isArray(section?.sectionItems)) return section.sectionItems;
  if (Array.isArray(section?.worksheetItems)) return section.worksheetItems;
  if (Array.isArray(section?.children)) return section.children;
  if (Array.isArray(section?.lineItems)) return section.lineItems;
  return [];
}

function getLooseWorksheetItems(payload) {
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.worksheetItems)) return payload.worksheetItems;
  if (Array.isArray(payload?.data?.worksheetItems)) return payload.data.worksheetItems;
  if (Array.isArray(payload?.lineItems)) return payload.lineItems;
  return [];
}

function toArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.sections)) return payload.sections;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.data?.sections)) return payload.data.sections;
  return [];
}

function mapWorksheetItem(item, sectionName, index) {
  const quantity = toNumber(item?.quantity ?? item?.qty ?? item?.units ?? item?.unitQty) || 1;
  const baseCost = toNumber(item?.cost ?? item?.baseCost ?? item?.internalCost);
  const sellPrice = toNumber(item?.price ?? item?.sellPrice ?? item?.total ?? item?.amount);
  const pricePerUnit = toNumber(item?.pricePerUnit ?? item?.sellPricePerUnit ?? item?.priceUnit) || (sellPrice > 0 ? sellPrice / quantity : 0);
  const costPerUnit = toNumber(item?.costPerUnit ?? item?.unitCost ?? item?.costUnit) || (baseCost > 0 ? baseCost / quantity : 0) || pricePerUnit;
  const itemName = item?.itemName || item?.name || item?.description || `Item ${index + 1}`;
  const note = item?.description && item?.description !== itemName ? item.description : item?.note || '';
  const resolvedBaseCost = baseCost || (costPerUnit * quantity);
  const resolvedSellPrice = sellPrice || ((pricePerUnit || costPerUnit) * quantity);
  const markupPercent = resolvedBaseCost > 0 && resolvedSellPrice > 0 ? ((resolvedSellPrice - resolvedBaseCost) / resolvedBaseCost) * 100 : 0;

  return {
    id: String(item?.id || crypto.randomUUID()),
    section: sectionName,
    description: itemName,
    unit: normalizeUnit(item?.unitOfMeasure || item?.unit || item?.uom),
    qty: quantity,
    unit_cost: pricePerUnit || costPerUnit,
    material_unit_cost: costPerUnit,
    labor_unit_cost: 0,
    equipment_unit_cost: 0,
    subcontract_unit_cost: 0,
    base_cost: resolvedBaseCost,
    sell_price: resolvedSellPrice,
    markup_percent: Number(markupPercent.toFixed(2)),
    cost_type: 'Material',
    item_code: item?.itemCode || item?.code || item?.sku || '',
    notes: note,
    waste_percent: 0,
  };
}

function mapWorksheetToLineItems(worksheet) {
  const rows = [];
  const sections = getWorksheetSections(worksheet);
  let sortOrder = 0;

  for (const section of sections) {
    const sectionName = section?.name || section?.sectionName || section?.title || section?.description || 'Section';
    rows.push({
      id: `section-${section?.id || crypto.randomUUID()}`,
      is_section_header: true,
      section: sectionName,
      sort_order: sortOrder++,
    });

    const items = getSectionItems(section);
    for (let index = 0; index < items.length; index++) {
      rows.push({
        ...mapWorksheetItem(items[index], sectionName, index),
        sort_order: sortOrder++,
      });
    }
  }

  const looseItems = getLooseWorksheetItems(worksheet);
  if (!sections.length && looseItems.length) {
    rows.push({
      id: `section-${crypto.randomUUID()}`,
      is_section_header: true,
      section: 'General',
      sort_order: sortOrder++,
    });
  }

  for (let index = 0; index < looseItems.length; index++) {
    rows.push({
      ...mapWorksheetItem(looseItems[index], 'General', index),
      sort_order: sortOrder++,
    });
  }

  return rows;
}

function calcEstimateMetrics(lineItems) {
  const detailRows = lineItems.filter((item) => !item.is_section_header);
  const materialSubtotal = detailRows.reduce((sum, item) => sum + (toNumber(item.qty) * toNumber(item.material_unit_cost)), 0);
  const laborSubtotal = detailRows.reduce((sum, item) => sum + (toNumber(item.qty) * toNumber(item.labor_unit_cost)), 0);
  const equipmentSubtotal = detailRows.reduce((sum, item) => sum + (toNumber(item.qty) * toNumber(item.equipment_unit_cost)), 0);
  const subcontractSubtotal = detailRows.reduce((sum, item) => sum + (toNumber(item.qty) * toNumber(item.subcontract_unit_cost)), 0);
  const totalCost = detailRows.reduce((sum, item) => sum + toNumber(item.base_cost), 0);
  const subtotal = detailRows.reduce((sum, item) => sum + toNumber(item.sell_price), 0);
  const grossProfit = subtotal - totalCost;
  const grossMarginPercent = subtotal > 0 ? (grossProfit / subtotal) * 100 : 0;

  return {
    materialSubtotal,
    laborSubtotal,
    equipmentSubtotal,
    subcontractSubtotal,
    totalCost,
    subtotal,
    grossProfit,
    grossMarginPercent,
  };
}

function calcVersionTotals(lineItems) {
  const items = lineItems.filter((item) => !item.is_section_header);
  const totals = {
    subtotal_material: 0,
    subtotal_labor: 0,
    subtotal_equipment: 0,
    subtotal_subcontract: 0,
    subtotal_other: 0,
    subtotal_allowances: 0,
    subtotal_contingency: 0,
    total_cost: 0,
    total_price: 0,
    gross_profit: 0,
    gross_margin_percent: 0,
  };

  for (const item of items) {
    const quantity = toNumber(item.qty);
    const material = quantity * toNumber(item.material_unit_cost);
    const labor = quantity * toNumber(item.labor_unit_cost);
    const equipment = quantity * toNumber(item.equipment_unit_cost);
    const subcontract = quantity * toNumber(item.subcontract_unit_cost);
    const baseCost = toNumber(item.base_cost);
    const sellPrice = toNumber(item.sell_price);

    totals.subtotal_material += material;
    totals.subtotal_labor += labor;
    totals.subtotal_equipment += equipment;
    totals.subtotal_subcontract += subcontract;
    totals.total_cost += baseCost;
    totals.total_price += sellPrice;
  }

  totals.gross_profit = totals.total_price - totals.total_cost;
  totals.gross_margin_percent = totals.total_price > 0 ? totals.gross_profit / totals.total_price : 0;
  return totals;
}

async function fetchEstimateLineItems(estimateId, financialId) {
  try {
    const sectionsResponse = await acculynxGet(`/estimates/${estimateId}/sections`);
    const sections = toArray(sectionsResponse);

    if (sections.length) {
      const rows = [];
      let sortOrder = 0;

      for (const section of sections) {
        const sectionId = section?.id || section?.estimateSectionId;
        const sectionName = section?.name || section?.sectionName || section?.title || section?.description || 'Section';
        rows.push({
          id: `section-${sectionId || crypto.randomUUID()}`,
          is_section_header: true,
          section: sectionName,
          sort_order: sortOrder++,
        });

        if (!sectionId) continue;

        const itemsResponse = await acculynxGet(`/estimates/${estimateId}/sections/${sectionId}/items`);
        const items = toArray(itemsResponse);
        for (let index = 0; index < items.length; index++) {
          rows.push({
            ...mapWorksheetItem(items[index], sectionName, index),
            sort_order: sortOrder++,
          });
        }

        await sleep(50);
      }

      return rows;
    }
  } catch (error) {
    console.error(`Section fetch failed for estimate ${estimateId}:`, error.message);
  }

  if (!financialId) return [];
  const worksheet = await acculynxGet(`/financials/${financialId}/worksheet`);
  return mapWorksheetToLineItems(worksheet);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    getApiKey();

    const payload = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const projectId = payload?.project_id || '';
    const limit = toNumber(payload?.limit);
    const offset = toNumber(payload?.offset);
    const batchSize = toNumber(payload?.batch_size) || 1;

    const [projects, estimates, versions, lineItems, materials] = await Promise.all([
      base44.asServiceRole.entities.Project.list('-updated_date', 5000),
      base44.asServiceRole.entities.Estimate.list('-updated_date', 5000),
      base44.asServiceRole.entities.EstimateVersion.list('-updated_date', 5000),
      base44.asServiceRole.entities.LineItem.list('sort_order', 5000),
      base44.asServiceRole.entities.Material.list('-updated_date', 5000),
    ]);

    let syncedProjects = projects.filter((project) => project.acculynx_job_id);
    if (projectId) {
      syncedProjects = syncedProjects.filter((project) => project.id === projectId);
    }
    if (limit > 0) {
      syncedProjects = syncedProjects.slice(0, limit);
    }

    if (!syncedProjects.length) {
      return Response.json({ message: 'No AccuLynx-linked projects found', estimates_synced: 0, materials_synced: 0, line_items_synced: 0, has_more: false, next_offset: null, processed_projects: 0, total_projects: 0 });
    }

    const totalProjects = syncedProjects.length;
    const batchProjects = projectId ? syncedProjects : syncedProjects.slice(offset, offset + batchSize);

    const estimateByExternalId = {};
    for (const estimate of estimates) {
      if (estimate.acculynx_estimate_id) estimateByExternalId[estimate.acculynx_estimate_id] = estimate;
    }

    const versionByEstimateId = {};
    for (const version of versions) {
      if (version.linked_estimate_id) versionByEstimateId[version.linked_estimate_id] = version;
    }

    const lineItemsByVersionId = {};
    for (const item of lineItems) {
      const versionId = item.estimate_version_id;
      if (!versionId) continue;
      if (!lineItemsByVersionId[versionId]) lineItemsByVersionId[versionId] = [];
      lineItemsByVersionId[versionId].push(item);
    }

    const materialByKey = {};
    for (const material of materials) {
      const key = `${String(material.name || '').trim().toLowerCase()}|${String(material.unit || '').trim().toLowerCase()}`;
      if (key !== '|') materialByKey[key] = material;
    }

    let estimatesCreated = 0;
    let estimatesUpdated = 0;
    let versionsSynced = 0;
    let materialsCreated = 0;
    let materialsUpdated = 0;
    let lineItemsSynced = 0;
    let worksheetMisses = 0;

    for (const project of batchProjects) {
      const estimateList = await acculynxGet(`/jobs/${project.acculynx_job_id}/estimates`);
      const estimateItems = estimateList.items || estimateList.data || (Array.isArray(estimateList) ? estimateList : []);
      const primaryEstimate = estimateItems.find((item) => item?.isPrimary || item?.primary);
      const estimatesToSync = payload?.sync_all ? estimateItems : (primaryEstimate ? [primaryEstimate] : estimateItems.slice(0, 1));

      for (const estimateStub of estimatesToSync) {
        const estimateDetail = await acculynxGet(`/estimates/${estimateStub.id}`);
        const financials = getFinancials(estimateDetail);
        const financialId = getFinancialId(estimateDetail);
        let mappedLineItems = [];

        try {
          mappedLineItems = await fetchEstimateLineItems(estimateStub.id, financialId);
        } catch (error) {
          console.error(`Estimate detail fetch failed for estimate ${estimateStub.id}:`, error.message);
        }

        if (!mappedLineItems.length) {
          worksheetMisses++;
        }

        const metrics = calcEstimateMetrics(mappedLineItems);
        const rawTaxRate = financials?.taxPercentage ?? financials?.taxRate ?? estimateDetail?.taxRate;
        const taxRate = toPercent(rawTaxRate);
        const subtotal = toNumber(financials?.subtotal ?? financials?.priceBeforeTax ?? financials?.price) || metrics.subtotal;
        const taxAmount = toNumber(financials?.salesTax ?? financials?.taxAmount) || (subtotal * taxRate / 100);
        const total = toNumber(financials?.totalPrice ?? financials?.total ?? estimateDetail?.total) || (subtotal + taxAmount);
        const totalCost = toNumber(financials?.totalCost ?? financials?.cost) || metrics.totalCost;
        const grossProfit = subtotal - totalCost;
        const grossMarginPercent = subtotal > 0 ? (grossProfit / subtotal) * 100 : 0;
        const externalEstimateId = String(estimateDetail?.id || estimateStub?.id);
        const title = estimateDetail?.name || estimateDetail?.title || estimateDetail?.estimateName || `${project.name} Estimate`;

        const estimatePayload = {
          estimate_number: String(estimateDetail?.estimateNumber ?? estimateStub?.estimateNumber ?? estimateStub?.number ?? '1'),
          project_id: project.id,
          client_id: project.client_id || '',
          linked_contact_id: project.client_id || '',
          project_type: project.project_type || 'Other',
          title,
          estimate_name: title,
          scope_of_work: estimateDetail?.scopeOfWork || '',
          status: normalizeStatus(estimateDetail?.status?.name || estimateDetail?.status || estimateStub?.status?.name || estimateStub?.status),
          issue_date: toDateString(estimateDetail?.issueDate || estimateDetail?.createdDate || estimateStub?.createdDate),
          expiry_date: toDateString(estimateDetail?.expirationDate || estimateDetail?.expiryDate || estimateStub?.expirationDate),
          tax_rate: taxRate,
          tax_amount: taxAmount,
          subtotal,
          total,
          margin_percent: totalCost > 0 ? ((subtotal - totalCost) / totalCost) * 100 : 0,
          estimated_revenue: subtotal,
          estimated_material_cost: metrics.materialSubtotal,
          estimated_labor_cost: metrics.laborSubtotal,
          estimated_subcontractor_cost: metrics.subcontractSubtotal,
          estimated_gross_profit: grossProfit,
          estimated_gross_margin_percent: grossMarginPercent,
          notes: `Synced from AccuLynx job ${project.acculynx_job_id}`,
          line_items: mappedLineItems,
          acculynx_estimate_id: externalEstimateId,
        };

        let savedEstimate = estimateByExternalId[externalEstimateId];
        if (savedEstimate) {
          await base44.asServiceRole.entities.Estimate.update(savedEstimate.id, estimatePayload);
          savedEstimate = { ...savedEstimate, ...estimatePayload };
          estimateByExternalId[externalEstimateId] = savedEstimate;
          estimatesUpdated++;
        } else {
          savedEstimate = await base44.asServiceRole.entities.Estimate.create(estimatePayload);
          estimateByExternalId[externalEstimateId] = savedEstimate;
          estimatesCreated++;
        }

        const estimateVersionId = `EV-${savedEstimate.id}`;
        const versionTotals = calcVersionTotals(mappedLineItems);
        const versionPayload = {
          estimate_version_id: estimateVersionId,
          project_id: project.id,
          linked_estimate_id: savedEstimate.id,
          version_name: title,
          version_type: 'Custom',
          created_by_name: user.full_name || user.email || 'AccuLynx Sync',
          created_date_value: toDateString(new Date().toISOString()),
          active_version: true,
          notes: `Synced from AccuLynx estimate ${externalEstimateId}`,
          ...versionTotals,
        };

        const existingVersion = versionByEstimateId[savedEstimate.id];
        if (existingVersion) {
          await base44.asServiceRole.entities.EstimateVersion.update(existingVersion.id, versionPayload);
        } else {
          const createdVersion = await base44.asServiceRole.entities.EstimateVersion.create(versionPayload);
          versionByEstimateId[savedEstimate.id] = createdVersion;
        }
        versionsSynced++;

        const existingVersionLineItems = lineItemsByVersionId[estimateVersionId] || [];
        for (const existingLineItem of existingVersionLineItems) {
          await base44.asServiceRole.entities.LineItem.delete(existingLineItem.id);
        }
        lineItemsByVersionId[estimateVersionId] = [];

        const detailRows = mappedLineItems
          .filter((row) => !row.is_section_header)
          .map((row, index) => ({
            line_item_id: row.id || crypto.randomUUID(),
            estimate_version_id: estimateVersionId,
            item_code: row.item_code || '',
            item_name: row.description || 'Item',
            item_description: row.notes || '',
            cost_type: row.cost_type || 'Material',
            unit_type: row.unit || 'EA',
            quantity: toNumber(row.qty),
            material_unit_cost: toNumber(row.material_unit_cost),
            labor_unit_cost: toNumber(row.labor_unit_cost),
            equipment_unit_cost: toNumber(row.equipment_unit_cost),
            subcontract_unit_cost: toNumber(row.subcontract_unit_cost),
            waste_percent: toNumber(row.waste_percent),
            base_cost: toNumber(row.base_cost),
            markup_percent: toNumber(row.markup_percent),
            sell_price: toNumber(row.sell_price),
            optional_flag: false,
            allowance_flag: false,
            included_flag: true,
            good_better_best_tier: 'All',
            production_rate: 0,
            labor_hours: 0,
            notes: row.notes || '',
            sort_order: index,
          }));

        for (const row of detailRows) {
          const createdLineItem = await base44.asServiceRole.entities.LineItem.create(row);
          lineItemsByVersionId[estimateVersionId].push(createdLineItem);
          lineItemsSynced++;
        }

        for (const row of mappedLineItems.filter((item) => !item.is_section_header)) {
          const key = `${String(row.description || '').trim().toLowerCase()}|${String(row.unit || '').trim().toLowerCase()}`;
          if (!key || key === '|') continue;

          const materialPayload = {
            name: row.description || 'Material',
            description: row.notes || '',
            category: row.section || 'AccuLynx',
            unit: row.unit || 'EA',
            material_cost: toNumber(row.material_unit_cost),
            labor_cost: 0,
            sub_cost: 0,
            unit_cost: toNumber(row.material_unit_cost),
            markup_type: 'markup_percent',
            markup_value: toNumber(row.markup_percent),
            overhead_percent: 0,
            profit_percent: 0,
            supplier: '',
            sku: row.item_code || '',
            notes: 'Synced from AccuLynx estimate details',
          };

          if (materialByKey[key]) {
            await base44.asServiceRole.entities.Material.update(materialByKey[key].id, materialPayload);
            materialByKey[key] = { ...materialByKey[key], ...materialPayload };
            materialsUpdated++;
          } else {
            const createdMaterial = await base44.asServiceRole.entities.Material.create(materialPayload);
            materialByKey[key] = createdMaterial;
            materialsCreated++;
          }
        }

        await sleep(DELAY_MS);
      }

      await sleep(DELAY_MS);
    }

    const nextOffset = offset + batchProjects.length;
    const hasMore = !projectId && nextOffset < totalProjects;

    return Response.json({
      message: `Synced ${estimatesCreated + estimatesUpdated} estimates, ${lineItemsSynced} line items, and ${materialsCreated + materialsUpdated} materials from AccuLynx`,
      estimates_synced: estimatesCreated + estimatesUpdated,
      estimates_created: estimatesCreated,
      estimates_updated: estimatesUpdated,
      versions_synced: versionsSynced,
      line_items_synced: lineItemsSynced,
      materials_synced: materialsCreated + materialsUpdated,
      materials_created: materialsCreated,
      materials_updated: materialsUpdated,
      worksheet_misses: worksheetMisses,
      projects: batchProjects.length,
      processed_projects: batchProjects.length,
      total_projects: totalProjects,
      has_more: hasMore,
      next_offset: hasMore ? nextOffset : null,
    });
  } catch (error) {
    console.error('acculynxSyncEstimatingData error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});