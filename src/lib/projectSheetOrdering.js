function getPrimaryDate(row) {
  return row?.start_date || row?.end_date || "";
}

function getSecondaryDate(row) {
  return row?.end_date || row?.start_date || "";
}

function compareDateValues(aPrimary, aSecondary, bPrimary, bSecondary) {
  const aHasDate = Boolean(aPrimary);
  const bHasDate = Boolean(bPrimary);

  if (aHasDate !== bHasDate) {
    return aHasDate ? -1 : 1;
  }

  if (!aHasDate && !bHasDate) {
    return 0;
  }

  if (aPrimary !== bPrimary) {
    return String(aPrimary).localeCompare(String(bPrimary));
  }

  return String(aSecondary).localeCompare(String(bSecondary));
}

function compareRowsByDate(a, b) {
  return compareDateValues(
    getPrimaryDate(a),
    getSecondaryDate(a),
    getPrimaryDate(b),
    getSecondaryDate(b)
  );
}

function groupRowsIntoSections(rows) {
  const sections = [];
  let current = null;

  for (const row of rows || []) {
    if (row.is_section_header) {
      current = { header: row, tasks: [] };
      sections.push(current);
      continue;
    }

    if (!current) {
      current = { header: null, tasks: [] };
      sections.push(current);
    }

    current.tasks.push(row);
  }

  return sections;
}

function groupTasksIntoBranches(tasks) {
  const branches = [];
  let index = 0;

  while (index < tasks.length) {
    const root = tasks[index];
    const rootIndent = root?.indent || 0;
    let end = index + 1;

    while (end < tasks.length && !tasks[end].is_section_header && (tasks[end].indent || 0) > rootIndent) {
      end += 1;
    }

    branches.push(tasks.slice(index, end));
    index = end;
  }

  return branches;
}

function getBranchSortValue(branch) {
  const datedRows = [...branch].filter((row) => getPrimaryDate(row));
  if (datedRows.length === 0) {
    return { primary: "", secondary: "" };
  }

  datedRows.sort(compareRowsByDate);
  return {
    primary: getPrimaryDate(datedRows[0]),
    secondary: getSecondaryDate(datedRows[0]),
  };
}

function flattenSections(sections) {
  return sections.flatMap((section) => {
    const content = [];
    if (section.header) {
      content.push(section.header);
    }
    content.push(...section.tasks);
    return content;
  });
}

function sortProjectSheetRows(rows) {
  const sections = groupRowsIntoSections(rows);

  return flattenSections(
    sections.map((section) => {
      const branches = groupTasksIntoBranches(section.tasks)
        .map((branch, index) => ({ branch, index, sortValue: getBranchSortValue(branch) }))
        .sort((a, b) => {
          const compare = compareDateValues(
            a.sortValue.primary,
            a.sortValue.secondary,
            b.sortValue.primary,
            b.sortValue.secondary
          );

          return compare || a.index - b.index;
        })
        .flatMap(({ branch }) => branch);

      return {
        ...section,
        tasks: branches,
      };
    })
  );
}

function insertTaskRowByDate(rows, newRow) {
  const sections = groupRowsIntoSections(rows);

  if (sections.length === 0) {
    return [newRow];
  }

  if (sections.length === 1 && !sections[0].header) {
    return sortProjectSheetRows([...(rows || []), newRow]);
  }

  const newRowPrimaryDate = getPrimaryDate(newRow);
  let targetSectionIndex = sections.length - 1;

  if (newRowPrimaryDate) {
    for (let index = 0; index < sections.length; index += 1) {
      const branchDates = groupTasksIntoBranches(sections[index].tasks)
        .map((branch) => getBranchSortValue(branch))
        .filter((value) => value.primary)
        .sort((a, b) => compareDateValues(a.primary, a.secondary, b.primary, b.secondary));

      const firstSectionDate = branchDates[0]?.primary;

      if (firstSectionDate && String(newRowPrimaryDate).localeCompare(String(firstSectionDate)) < 0) {
        targetSectionIndex = Math.max(0, index - 1);
        break;
      }
    }
  }

  const nextSections = sections.map((section, index) => (
    index === targetSectionIndex
      ? { ...section, tasks: [...section.tasks, newRow] }
      : section
  ));

  return sortProjectSheetRows(flattenSections(nextSections));
}

function createInspectionSheetRow(task) {
  const isCompleted = Boolean(task?.completed);
  const dueDate = task?.due_date || "";

  return {
    id: `inspection-${task?.id || Math.random().toString(36).slice(2, 10)}`,
    is_section_header: false,
    section: "",
    task: task?.title || "Inspection Task",
    assigned_to: "",
    start_date: dueDate,
    end_date: dueDate,
    duration: dueDate ? "1 day" : "",
    status: isCompleted ? "Completed" : "Not Started",
    percent_complete: isCompleted ? 100 : 0,
    notes: task?.notes || "",
    linked_inspection_task_id: task?.id || "",
  };
}

const sortSheetRowsByDates = sortProjectSheetRows;
const insertRowIntoSheetByDate = insertTaskRowByDate;

export {
  sortProjectSheetRows,
  insertTaskRowByDate,
  sortSheetRowsByDates,
  insertRowIntoSheetByDate,
  createInspectionSheetRow,
};

export default {
  sortProjectSheetRows,
  insertTaskRowByDate,
  sortSheetRowsByDates,
  insertRowIntoSheetByDate,
  createInspectionSheetRow,
};