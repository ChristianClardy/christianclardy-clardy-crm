import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20'; // redeployed

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // This can be called by a scheduled automation (no user auth needed — use service role)
  const projects = await base44.asServiceRole.entities.Project.list();
  const activeProjects = projects.filter(p => p.status !== 'completed' && p.status !== 'cancelled');

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in7 = new Date(today);
  in7.setDate(in7.getDate() + 7);

  const notifications = [];

  for (const proj of activeProjects) {
    const sheets = await base44.asServiceRole.entities.ProjectSheet.filter({ project_id: proj.id });
    const sheet = sheets[0];
    if (!sheet?.rows) continue;

    for (const row of sheet.rows) {
      if (row.is_section_header || !row.end_date || row.status?.toLowerCase() === 'completed') continue;
      const due = new Date(row.end_date);
      due.setHours(0, 0, 0, 0);
      const diffDays = Math.round((due - today) / 86400000);

      if (diffDays < 0 && diffDays >= -1) {
        // Just became overdue (1 day grace)
        notifications.push({
          title: `Task Overdue: ${row.task}`,
          message: `"${row.task}" in project "${proj.name}" was due ${row.end_date}.`,
          type: 'deadline',
          link: `/ProjectDetail?id=${proj.id}`,
          related_id: proj.id,
        });
      } else if (diffDays === 1 || diffDays === 3) {
        notifications.push({
          title: `Deadline in ${diffDays} day${diffDays > 1 ? 's' : ''}: ${row.task}`,
          message: `"${row.task}" in project "${proj.name}" is due on ${row.end_date}.`,
          type: 'deadline',
          link: `/ProjectDetail?id=${proj.id}`,
          related_id: proj.id,
        });
      }
    }
  }

  // Get all admin users to notify
  const users = await base44.asServiceRole.entities.User.list();
  const admins = users.filter(u => u.role === 'admin');

  const created = [];
  for (const notif of notifications) {
    for (const admin of admins) {
      const existing = await base44.asServiceRole.entities.Notification.filter({
        user_email: admin.email,
        related_id: notif.related_id,
        title: notif.title,
      });
      if (existing.length === 0) {
        const n = await base44.asServiceRole.entities.Notification.create({
          ...notif,
          user_email: admin.email,
        });
        created.push(n);
      }
    }
  }

  return Response.json({ created: created.length });
});