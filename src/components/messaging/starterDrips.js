// Starter drips added (turned off) by "Add starter drips" on an empty
// Automations page. Plain copy meant to be edited in the workflow builder.
import { newNodeId } from "@/lib/workflow";

const DAY = 1440;
const email = (subject, body) => ({ id: newNodeId(), type: "email", subject, body });
const sms = (body) => ({ id: newNodeId(), type: "sms", body });
const wait = (minutes) => ({ id: newNodeId(), type: "wait", minutes });
const ifThen = (condition, yes, no) => ({ id: newNodeId(), type: "condition", condition, yes, no });
const action = (a) => ({ id: newNodeId(), type: "action", action: a });
const flow = (...nodes) => ({ version: 1, nodes });

export const STARTER_DRIPS = [
  {
    name: "New lead welcome",
    description: "Instant text and email, then follow-ups until they're contacted. Hands the lead to the rep if they go quiet.",
    trigger_type: "lead_created", stop_on_reply: true, stop_on_stage_change: true,
    workflow: flow(
      wait(2),
      sms("Hi {{first_name|there}}, this is {{rep_name|the team}} with {{company_name}}. Thanks for reaching out about your project! When's a good time for a quick call to set up a site visit?"),
      wait(10),
      email("Thanks for contacting {{company_name}}", "Hi {{first_name|there}},\n\nThanks for your interest in {{company_name}}. We'd love to hear about your plans for {{address|your property}}.\n\nThe next step is a free site visit so we can see the space, talk through ideas and give you an accurate price. Just reply to this email or call us at {{company_phone}} to pick a time.\n\nTalk soon,\n{{rep_name|The team}}\n{{company_name}}"),
      wait(2 * DAY),
      sms("Hi {{first_name|there}}, just following up from {{company_name}}. Do you have 10 minutes this week to talk about your project?"),
      wait(3 * DAY),
      email("Still thinking about your outdoor project?", "Hi {{first_name|there}},\n\nI wanted to check in. Whenever you're ready, we can come out, measure, and walk you through options and pricing. No pressure at all.\n\nReply here or call {{company_phone}} and we'll get you on the schedule.\n\n{{rep_name|The team}}\n{{company_name}}"),
      wait(2 * DAY),
      action({ kind: "create_task", title: "Call {{full_name}}: no response to welcome drip", notes: "Sent 2 texts and 2 emails over 7 days.", due_days: 0, assign: "rep", priority: "high" }),
    ),
  },
  {
    name: "Quote follow-up",
    description: "After the quote is delivered. Splits on whether they opened the email, and flags the rep if they go quiet.",
    trigger_type: "lead_stage", trigger_value: "Quote Delivered/Price Locked", stop_on_reply: true, stop_on_stage_change: true,
    workflow: flow(
      wait(1 * DAY),
      email("Any questions about your quote?", "Hi {{first_name|there}},\n\nI wanted to make sure you received your quote and see if any questions came up. Happy to walk through it line by line or adjust the scope to fit your budget.\n\n{{rep_name|The team}}\n{{company_name}}\n{{company_phone}}"),
      wait(2 * DAY),
      ifThen(
        { kind: "email_opened", scope: "last" },
        [
          sms("Hi {{first_name|there}}, it's {{rep_name|the team}} at {{company_name}}. Saw you had a chance to look over the quote. Want to hop on a quick call to go over it?"),
        ],
        [
          email("Your {{company_name}} quote", "Hi {{first_name|there}},\n\nJust making sure my last email didn't get buried. Your quote is ready whenever you are, and I'm happy to walk through it.\n\n{{rep_name|The team}}\n{{company_name}}\n{{company_phone}}"),
        ],
      ),
      wait(4 * DAY),
      email("Holding your spot on our schedule", "Hi {{first_name|there}},\n\nOur install calendar fills up quickly, and I'd like to hold a spot for your project. If you're ready to move forward, reply and we'll send the agreement over.\n\nIf the timing isn't right, just let me know. No problem at all.\n\n{{rep_name|The team}}\n{{company_name}}"),
      wait(3 * DAY),
      action({ kind: "notify", to: "rep", title: "{{full_name}} hasn't responded to their quote", message: "The quote follow-up drip has finished with no reply. Worth a call." }),
    ),
  },
  {
    name: "Project complete: thank you & review",
    description: "Thanks, a review request, and a referral ask after the job is done.",
    trigger_type: "project_status", trigger_value: "completed", stop_on_reply: false, stop_on_stage_change: false,
    workflow: flow(
      wait(1 * DAY),
      email("Thank you from {{company_name}}", "Hi {{first_name|there}},\n\nThank you for trusting us with {{project_name|your project}}. It was a pleasure working with you, and we hope you enjoy your new space for years to come.\n\nIf anything comes up, reply to this email or call {{company_phone}}.\n\n{{company_name}}"),
      wait(3 * DAY),
      sms("Hi {{first_name|there}}, it's {{company_name}}. If you're happy with your project, would you leave us a quick review? It helps a ton. [paste your Google review link here]"),
      wait(30 * DAY),
      email("Know someone planning a project?", "Hi {{first_name|there}},\n\nHow's everything holding up? Most of our work comes from referrals, so if a friend or neighbor is planning an outdoor project, we'd be grateful for an introduction.\n\nThanks again,\n{{company_name}}"),
    ),
  },
];
