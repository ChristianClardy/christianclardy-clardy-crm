import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const DEFAULT_REPO = 'christianclardy/clardy-crm';

const statusLabel = {
  not_started: 'Not started',
  in_progress: 'In progress',
  waiting: 'Waiting',
  complete: 'Complete',
  completed: 'Completed',
  overdue: 'Overdue',
  blocked: 'Blocked',
};

const priorityLabel = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

function buildBody(task) {
  const lines = [
    `Task ID: ${task.id}`,
    `Status: ${statusLabel[task.status] || task.status || 'Not started'}`,
    `Priority: ${priorityLabel[task.priority] || task.priority || 'Medium'}`,
    `Assigned to: ${task.assigned_to || 'Unassigned'}`,
    `Project ID: ${task.project_id || '—'}`,
    `Lead ID: ${task.linked_lead_id || '—'}`,
    `Due date: ${task.due_date || '—'}`,
    '',
    'Description:',
    task.description || '—',
  ];

  if (Array.isArray(task.subtasks) && task.subtasks.length) {
    lines.push('', 'Subtasks:');
    task.subtasks.forEach((subtask) => {
      lines.push(`- [${subtask.completed ? 'x' : ' '}] ${subtask.title || 'Untitled subtask'}`);
    });
  }

  return lines.join('\n');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const taskId = payload?.taskId;

    if (!taskId) {
      return Response.json({ error: 'taskId is required' }, { status: 400 });
    }

    const task = await base44.asServiceRole.entities.Task.get(taskId);
    if (!task?.github_issue_number) {
      return Response.json({ skipped: true, reason: 'No linked GitHub issue on this task' });
    }

    const repo = task.github_repo || DEFAULT_REPO;
    const [owner, name] = repo.split('/');

    if (!owner || !name) {
      return Response.json({ error: 'Invalid GitHub repository format on task' }, { status: 400 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('github');

    const response = await fetch(`https://api.github.com/repos/${owner}/${name}/issues/${task.github_issue_number}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        title: task.name,
        body: buildBody(task),
        state: task.status === 'complete' || task.status === 'completed' ? 'closed' : 'open',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return Response.json({ error: errorText }, { status: response.status });
    }

    const issue = await response.json();

    await base44.asServiceRole.entities.Task.update(task.id, {
      github_issue_url: issue.html_url,
      github_repo: repo,
    });

    return Response.json({
      success: true,
      issue_number: issue.number,
      issue_url: issue.html_url,
      repo,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});