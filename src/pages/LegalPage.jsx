// Public legal pages: /eula (also /terms) and /privacy. Rendered by App.jsx
// before any sign-in check, so Intuit, DocuSign, customers and subs can read
// them without an account. Keep the effective date current when editing.

const COMPANY = "Clardy Construction, LLC";
const APP = "Clardy";
const SITE = "https://clardy.io";
const EMAIL = "christianclardy7@gmail.com";
const STATE = "Texas";
const EFFECTIVE = "October 2, 2026";

function Shell({ title, children }) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f5f0eb", color: "#3d3530" }}>
      <header className="border-b" style={{ borderColor: "#ddd5c8", backgroundColor: "#3d3530" }}>
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <a href="/" className="font-bold tracking-wide" style={{ color: "#f5f0eb" }}>{APP}</a>
          <nav className="flex gap-4 text-sm">
            <a href="/eula" style={{ color: "#c9ac76" }}>License Agreement</a>
            <a href="/privacy" style={{ color: "#c9ac76" }}>Privacy Policy</a>
          </nav>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-8">
        <article className="rounded-2xl bg-white p-6 sm:p-10 shadow-sm space-y-5 text-[15px] leading-relaxed" style={{ border: "1px solid #ddd5c8" }}>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold" style={{ fontFamily: "Georgia, serif" }}>{title}</h1>
            <p className="text-sm mt-1" style={{ color: "#7a6e66" }}>Effective {EFFECTIVE} · {COMPANY}</p>
          </div>
          {children}
        </article>
        <p className="text-center text-xs mt-6" style={{ color: "#a89e96" }}>© {new Date().getFullYear()} {COMPANY}. Questions: <a href={`mailto:${EMAIL}`} className="underline">{EMAIL}</a></p>
      </main>
    </div>
  );
}

const H = ({ children }) => <h2 className="text-lg font-semibold pt-3" style={{ fontFamily: "Georgia, serif" }}>{children}</h2>;
const UL = ({ children }) => <ul className="list-disc pl-6 space-y-1.5">{children}</ul>;
const Mail = () => <a href={`mailto:${EMAIL}`} className="underline" style={{ color: "#8a6d3b" }}>{EMAIL}</a>;

export function EulaPage() {
  return (
    <Shell title="End-User License Agreement">
      <p>
        This End-User License Agreement ("Agreement") is between you and {COMPANY} ("{APP}," "we," "us"), and governs your use of
        the {APP} web application at {SITE}, including the Subcontractor, Builder and Customer Portals and any installed version of the
        app (together, the "Service"). By signing in to or using the Service, you agree to this Agreement. If you use the Service on
        behalf of a company, you agree on its behalf and confirm you are authorized to do so.
      </p>

      <H>1. Who may use the Service</H>
      <p>
        The Service is a private business application. Accounts are created only by invitation from {COMPANY}: staff, project
        managers, subcontractors and customers receive access limited to what their role requires. You must be at least 18 years old
        and must not share your login or let anyone else use your account.
      </p>

      <H>2. License</H>
      <p>
        Subject to this Agreement, we grant you a limited, non-exclusive, non-transferable, revocable license to use the Service for its
        intended business purposes while your account is active. You may not: copy, modify or create derivative works of the Service;
        reverse engineer it except where the law allows; resell, sublicense or rent it; access it by automated means other than features
        we provide; attempt to reach data or areas your role does not grant; or use it in violation of any law.
      </p>

      <H>3. Connected services</H>
      <p>
        The Service can connect to third-party services you or your organization authorize, including Intuit QuickBooks Online (to send
        invoices and keep payments, bills and job costs in sync) and DocuSign (to send documents for signature). When you connect a
        third-party service, you authorize us to access and exchange data with it on your behalf as described in our{" "}
        <a href="/privacy" className="underline" style={{ color: "#8a6d3b" }}>Privacy Policy</a>. Your use of those services is also
        governed by their own terms, and we are not responsible for them. You can disconnect QuickBooks at any time in Settings →
        QuickBooks or from your Intuit account.
      </p>

      <H>4. Your content</H>
      <p>
        You keep ownership of the data, documents and photos you put into the Service ("Your Content"). You give us permission to store,
        process and display Your Content only to provide and support the Service. You are responsible for having the right to upload
        Your Content and for its accuracy, including financial figures sent to QuickBooks and documents sent for signature.
      </p>

      <H>5. Agreements made in the Service</H>
      <p>
        Documents signed through the Service (such as contracts, change orders and the Subcontractor Agreement) are agreements between
        the parties who sign them. The Service records and stores them; it does not give legal, tax or accounting advice, and
        calculations it shows (estimates, draws, projected profit, job costs) are tools to help you, not professional advice.
      </p>

      <H>6. Availability and changes</H>
      <p>
        We work to keep the Service available and secure but do not guarantee it will be uninterrupted or error-free. We may change,
        add or remove features. We may suspend or end your access if you breach this Agreement, if your role no longer needs access, or
        to protect the Service or other users.
      </p>

      <H>7. Disclaimer of warranties</H>
      <p className="uppercase text-[13px]">
        The Service is provided "as is" and "as available." To the fullest extent permitted by law, we disclaim all warranties, express or
        implied, including merchantability, fitness for a particular purpose, title and non-infringement.
      </p>

      <H>8. Limitation of liability</H>
      <p className="uppercase text-[13px]">
        To the fullest extent permitted by law, {COMPANY} will not be liable for any indirect, incidental, special, consequential or
        punitive damages, or for lost profits, revenue or data, arising from or related to the Service. Our total liability for any claim
        related to the Service will not exceed the greater of the amount you paid us for the Service in the 12 months before the claim or
        one hundred U.S. dollars ($100).
      </p>

      <H>9. Indemnity</H>
      <p>
        You agree to defend and indemnify {COMPANY} against claims arising from your misuse of the Service, Your Content, or your breach of
        this Agreement.
      </p>

      <H>10. Ending this Agreement</H>
      <p>
        You may stop using the Service at any time. This Agreement ends when your access ends. Sections 4 (as to permissions needed to
        retain records), 5, 7, 8, 9 and 11 survive.
      </p>

      <H>11. Governing law</H>
      <p>
        This Agreement is governed by the laws of the State of {STATE}, without regard to its conflict-of-laws rules. Any dispute will be
        brought in the state or federal courts located in {STATE}, and you consent to their jurisdiction.
      </p>

      <H>12. Changes to this Agreement</H>
      <p>
        We may update this Agreement. We will post the new version here with a new effective date; continuing to use the Service after
        that means you accept it.
      </p>

      <H>13. Contact</H>
      <p>{COMPANY} · <Mail /> · {SITE}</p>
    </Shell>
  );
}

export function PrivacyPage() {
  return (
    <Shell title="Privacy Policy">
      <p>
        This Privacy Policy explains how {COMPANY} ("{APP}," "we," "us") collects, uses and protects information in the {APP} web
        application at {SITE}, including the Subcontractor, Builder and Customer Portals (the "Service").
      </p>

      <H>1. Information we collect</H>
      <UL>
        <li><strong>Account information:</strong> name, email address, phone number, role, and sign-in records for invited users.</li>
        <li><strong>Customer and project information:</strong> client and lead contact details, property addresses, estimates, contracts, change orders, schedules, selections, photos, documents and notes entered by our team.</li>
        <li><strong>Financial information:</strong> contract amounts, invoices, payment records (amount, date, method, reference number), draw schedules, subcontractor and vendor invoices, and job costs. We do not store full credit card or bank account numbers; online payments are handled by Intuit QuickBooks Payments.</li>
        <li><strong>Subcontractor information:</strong> company and contact details, trades, insurance and license dates, job assignments, daily logs, site photos and signed agreements.</li>
        <li><strong>Information from QuickBooks Online:</strong> when an administrator connects QuickBooks, we access the connected company's customers, vendors, items, accounts, invoices, payments, bills and profit-and-loss and receivables reports, as needed to provide the features below.</li>
        <li><strong>Technical information:</strong> basic logs (such as IP address, browser and time of request) kept by our hosting and database providers for security and troubleshooting.</li>
      </UL>

      <H>2. How we use information</H>
      <UL>
        <li>To run the Service: manage leads, projects, schedules, documents, billing and job costs.</li>
        <li>To show each user only what their role allows (staff, project managers, subcontractors, customers).</li>
        <li>To send documents for signature through DocuSign and file the signed copies.</li>
        <li>With QuickBooks connected: to create customers, jobs, invoices, bills and payments in QuickBooks; to bring payments and paid statuses back into the Service; and to show QuickBooks job profit and receivables inside the Service.</li>
        <li>To secure the Service, prevent misuse, and support users.</li>
      </UL>
      <p>We do not sell personal information, use it for advertising, or share it with data brokers.</p>

      <H>3. How we share information</H>
      <p>We share information only as needed to provide the Service:</p>
      <UL>
        <li><strong>Service providers</strong> that host and run the Service: Supabase (database, sign-in and file storage) and Vercel (web hosting).</li>
        <li><strong>Services you connect:</strong> Intuit QuickBooks Online and DocuSign, under their own privacy policies.</li>
        <li><strong>The people on a project:</strong> for example, a customer sees their own project's progress, payments and signed documents; a subcontractor sees only the jobs assigned to them.</li>
        <li><strong>When required by law</strong>, or to protect the rights, property or safety of {COMPANY}, our users or others.</li>
      </UL>

      <H>4. QuickBooks data</H>
      <p>
        QuickBooks access is granted by an administrator through Intuit's secure sign-in, and access tokens are stored on our servers only;
        they are never sent to users' browsers. We use QuickBooks data only to provide the features described above, and we do not use
        it for any other purpose. An administrator can disconnect QuickBooks at any time in Settings → QuickBooks or from their Intuit
        account; after disconnecting, we stop accessing QuickBooks. Records already brought into the Service (such as payments) stay as
        part of the project's history unless deletion is requested.
      </p>

      <H>5. Security</H>
      <p>
        Data is encrypted in transit (HTTPS) and stored with our database provider, which encrypts it at rest. Access is limited by role
        through database-level rules, and only invited users can sign in. No system is perfectly secure, so please keep your password private
        and tell us right away if you think your account has been misused.
      </p>

      <H>6. How long we keep information</H>
      <p>
        We keep project, contract and financial records for as long as needed to run the business and meet legal, tax and warranty
        obligations. Accounts that no longer need access are turned off. You can ask us to delete information that we are not required to keep.
      </p>

      <H>7. Your choices and rights</H>
      <p>
        You can ask to see, correct or delete your personal information, or ask questions about this policy, by emailing <Mail />. We
        will respond within 30 days. Depending on where you live, you may have additional rights under applicable law, including the{" "}
        {STATE} Data Privacy and Security Act.
      </p>

      <H>8. Children</H>
      <p>The Service is for business use and is not directed to children under 13. We do not knowingly collect their information.</p>

      <H>9. Changes to this policy</H>
      <p>We may update this policy. We will post the new version here with a new effective date.</p>

      <H>10. Contact</H>
      <p>{COMPANY} · <Mail /> · {SITE}</p>
    </Shell>
  );
}
