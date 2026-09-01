// In-app user guide content. Pure data — rendered by /help pages and linked
// contextually from the header help button. `roles` controls which guides are
// featured on a user's help index; every guide stays readable by everyone so
// shared links never dead-end.

import type { Profile } from "@/lib/supabase/profile";

export type GuideRole = Profile["role"];

export type GuideSection = {
  heading: string;
  body?: string[];
  steps?: string[];
  tips?: string[];
};

export type Guide = {
  slug: string;
  title: string;
  summary: string;
  roles: GuideRole[];
  sections: GuideSection[];
};

const ALL_ROLES: GuideRole[] = ["admin", "branch_rep", "top_mgmt", "technical"];

export const GUIDES: Guide[] = [
  {
    slug: "getting-started",
    title: "Getting started",
    summary:
      "Sign in, find your way around, and learn what your role can do.",
    roles: ALL_ROLES,
    sections: [
      {
        heading: "Signing in",
        steps: [
          "Open the app and sign in with the email address your administrator gave you and the temporary password you were issued.",
          "First sign-in always lands on Set your password — choose your own password (at least 8 characters, and different from the temporary one) before you can go anywhere else in the app.",
          "From then on, sign in with your email and the password you chose. If you forget it, use the “Forgot password” link on the login page and follow the email instructions.",
          "If your account was deactivated or you cannot sign in, contact your administrator — accounts are managed under Admin → Users.",
        ],
      },
      {
        heading: "Finding your way around",
        body: [
          "The sidebar on the left lists every area you can access, grouped by function (Inventory, Sales, Customers, Transfers, Repairs, Reports). You only see the sections your role allows.",
          "The bar at the top shows your branch and role, and holds the Help button (question-mark icon) and your account menu, where you sign out.",
          "The chat button at the bottom-right corner opens the organization-wide chat — use it to reach head office or any branch. See the “Chat and messages” guide.",
        ],
      },
      {
        heading: "What each role can do",
        body: [
          "Admin (head office): full access — stock intake, products, suppliers, all branches’ data, serving stock requests, and user management.",
          "Branch Representative: your branch’s stock, sales, customers, transfers and stock requests, and repair/earmold intake.",
          "Top Management: read access across all branches, plus reports.",
          "Technical: the repairs and earmolds work queues.",
        ],
      },
      {
        heading: "Common first tasks",
        tips: [
          "Branch reps: check your stock under Inventory → Stock, then try recording a sale (Sales → Record sale).",
          "Need stock from head office? Create a stock request (Transfers → Stock requests).",
          "Admins: start with Inventory → Add New Inventory to receive new stock, and Admin → Users to onboard your team.",
          "Every page has a matching guide — click the question-mark icon in the top bar at any time.",
        ],
      },
    ],
  },
  {
    slug: "inventory",
    title: "Inventory and stock",
    summary:
      "View stock, receive new stock into the system, and manage products and suppliers.",
    roles: ["admin", "branch_rep", "top_mgmt"],
    sections: [
      {
        heading: "Viewing stock",
        body: [
          "Inventory → Stock lists the stock at your branch (admins and top management see every branch). Use the search and filters to find items by product, serial number, or status.",
          "Inventory → Aging (under Stock) highlights stock that has been sitting since delivery, so slow-moving items are easy to spot.",
        ],
      },
      {
        heading: "Receiving new stock (admin)",
        steps: [
          "Go to Inventory → Add New Inventory.",
          "Pick the product, supplier, and destination branch.",
          "Enter quantity, unit cost, and the supplier invoice number and date.",
          "For serialized products (e.g. hearing aids), enter each serial number — one stock record is created per serial.",
          "Submit. The stock immediately appears in the destination branch’s inventory.",
        ],
        tips: [
          "If the product does not exist yet, add it first under Inventory → Manage Products.",
        ],
      },
      {
        heading: "Products and suppliers (admin / top management)",
        body: [
          "Inventory → Manage Products is the master catalog: name, code, category, supplier, SRP, and whether the product is serial-tracked. Archive products you no longer sell instead of deleting them.",
          "Inventory → Manage Suppliers stores vendor contact details and payment terms, and is referenced by products and stock intake.",
        ],
      },
    ],
  },
  {
    slug: "sales",
    title: "Recording sales and returns",
    summary:
      "Record stock and service sales, review sales history, and process returns.",
    roles: ["admin", "branch_rep", "top_mgmt"],
    sections: [
      {
        heading: "Recording a sale",
        steps: [
          "Go to Sales → Record sale.",
          "Select an existing customer or add a new one on the spot.",
          "Set the sale date and official receipt details (OR / CSI / CI numbers).",
          "Add line items: stock items are picked from your branch inventory (by serial for serialized products), and services use your branch’s service pricing.",
          "Apply any discount, review the VAT breakdown and total, then save.",
        ],
        tips: [
          "Sold stock is deducted from your branch inventory automatically.",
          "The sale is linked to the customer’s record, so it appears in their purchase history.",
        ],
      },
      {
        heading: "Sales history",
        body: [
          "Sales → Sales history lists your branch’s sales (all branches for admin and top management). Open a sale to see its full detail, print it, or process a return.",
        ],
      },
      {
        heading: "Processing a return",
        steps: [
          "Open the sale from Sales history.",
          "Use the Return action on the line being returned and enter the returned quantity and date.",
          "The item’s after-sales status is updated (returned or partially returned) and the stock record is adjusted.",
        ],
      },
    ],
  },
  {
    slug: "customers",
    title: "Customers and visits",
    summary: "Maintain the customer database and log patient visits.",
    roles: ["admin", "branch_rep", "top_mgmt"],
    sections: [
      {
        heading: "Managing customers",
        body: [
          "Customers lists everyone created by your branch (admins and top management see all branches). Add a customer with their name, mobile number, email, address, and date of birth.",
          "Open a customer to see their contact details, purchase history, and visit log in one place.",
        ],
      },
      {
        heading: "Logging a visit",
        steps: [
          "Open the customer’s page.",
          "Add a visit with the date, the purpose (consultation, fitting, follow-up, etc.), and any remarks.",
          "Mark whether a purchase was made during the visit, and attach photos or PDFs if you have any.",
          "Check “This is a hearing test” and attach the test file if the visit was a hearing test — it then appears in the cross-branch hearing-test queue for review. See the “Hearing-test reviews” guide.",
        ],
        tips: [
          "Logging visits consistently gives head office an accurate picture of branch foot traffic and follow-up needs.",
        ],
      },
      {
        heading: "Linking a visit to a sale",
        body: [
          "Open the customer’s page and find the visit in Visit history. Use the “Link to sale” control on the visit to choose the sale that resulted from it.",
          "Linking automatically marks the visit as a purchase, and a badge on the visit shows whether the linked sale was an Item, Service, or Item + Service sale.",
          "Choose “No sale linked” to unlink a visit from a sale — this clears the purchase flag again.",
        ],
        tips: [
          "Any role that can open the customer’s page, including branch representatives, can link or unlink a visit’s sale.",
        ],
      },
    ],
  },
  {
    slug: "transfers",
    title: "Branch-to-branch transfers",
    summary:
      "Move stock between branches: draft, reserve, dispatch, and receive.",
    roles: ["admin", "branch_rep", "top_mgmt"],
    sections: [
      {
        heading: "How a transfer flows",
        body: [
          "A transfer moves through four statuses: Draft → Reserved → In transit → Confirmed.",
          "The sending branch (or admin) builds and dispatches it; the receiving branch confirms arrival. Head office can see and manage every transfer.",
        ],
      },
      {
        heading: "Creating and dispatching (sending branch)",
        steps: [
          "Go to Transfers → Transfers and create a new transfer, choosing the from and to branches.",
          "While the transfer is a Draft, add lines by searching the sending branch’s stock and setting quantities (serialized items transfer one serial per line).",
          "Click Reserve. This locks the stock so it cannot be sold or added to another transfer while in motion.",
          "Click Dispatch and enter the courier, tracking code, and SIS number. The transfer becomes In transit.",
          "Use the Print button for a paper transfer slip to include with the shipment.",
        ],
        tips: [
          "Drafts left untouched are flagged as stale — delete drafts you no longer need to release clutter.",
        ],
      },
      {
        heading: "Receiving (destination branch)",
        steps: [
          "Open the transfer from Transfers → Transfers once it is In transit.",
          "Confirm each line as it is checked against the physical shipment; add a note on any line with a problem (damage, missing items).",
          "When every line is confirmed, the transfer becomes Confirmed and the stock moves into your branch’s inventory.",
        ],
      },
      {
        heading: "Discussing a transfer",
        body: [
          "Every transfer page has a Messages thread shared by head office and both branches. Use it for questions about the shipment — courier delays, wrong serials, partial deliveries — so the discussion stays attached to the transfer itself. See the “Chat and messages” guide.",
        ],
      },
    ],
  },
  {
    slug: "stock-requests",
    title: "Stock requests",
    summary:
      "Branches request stock from head office; admins review and serve requests.",
    roles: ["admin", "branch_rep", "top_mgmt"],
    sections: [
      {
        heading: "Requesting stock (branch)",
        steps: [
          "Go to Transfers → Stock requests and create a new request.",
          "Add each product and the quantity you need, with notes for context.",
          "Submit. The request starts as Pending and head office is able to see it immediately.",
          "Track progress on the Stock requests page: Pending → Processing → Served.",
        ],
      },
      {
        heading: "Serving a request (admin)",
        steps: [
          "Open the request from Transfers → Stock requests.",
          "Review the requested lines and use Serve to create a transfer that fulfills them.",
          "The generated transfer follows the normal transfer flow (reserve, dispatch, receive) and is linked back to the request.",
        ],
        tips: [
          "If you can only partially fulfill a request, serve what is available and use the transfer’s Messages thread to tell the branch what is on back-order.",
        ],
      },
    ],
  },
  {
    slug: "repairs",
    title: "Repairs",
    summary:
      "Log repair jobs, track their progress with status events, and share status with customers.",
    roles: ALL_ROLES,
    sections: [
      {
        heading: "Logging a repair (intake)",
        steps: [
          "Go to Repairs → Repair intake.",
          "Select the customer (or add them) and enter the device details: serial number, issue description, and any downpayment.",
          "Save. The repair gets an SAR number and starts as Pending.",
        ],
      },
      {
        heading: "Working the repair (technical / admin)",
        body: [
          "Open a repair from Repairs → Repairs to see its timeline. Add status events as the job progresses: Received → Assessed → In repair → Ready → Returned. Each event can carry a note (findings, parts used, quotes).",
          "The repair’s overall status (Pending, In progress, For replacement, Completed) is updated as you work, and the returned-to-customer date is recorded at handover.",
        ],
      },
      {
        heading: "Letting the customer check status",
        steps: [
          "On the repair page, use “Copy link” to get the public status link.",
          "Send the link to the customer (SMS or email).",
          "The customer enters the SAR number plus their mobile number (or last name) to verify, and sees the repair’s progress timeline — no account needed.",
        ],
      },
    ],
  },
  {
    slug: "earmolds",
    title: "Earmold requests",
    summary: "Request custom earmolds and track them to completion.",
    roles: ALL_ROLES,
    sections: [
      {
        heading: "Creating a request",
        steps: [
          "Go to Repairs → Earmolds and create a new request.",
          "Enter the patient’s name, contact number, and address.",
          "Record the hearing aid model, the ear side (left, right, or both), and the serial number, plus any remarks for the lab.",
          "Submit. The request starts as Pending.",
        ],
      },
      {
        heading: "Tracking progress",
        body: [
          "Requests move Pending → Processing → Served. Technical and admin staff update the status from the Earmolds list as molds are made and delivered back to the branch.",
        ],
      },
    ],
  },
  {
    slug: "reports",
    title: "Reports and exports",
    summary: "Sales reports, stock movement history, and CSV exports.",
    roles: ["admin", "branch_rep", "top_mgmt"],
    sections: [
      {
        heading: "Sales report",
        body: [
          "Reports → Sales report charts and totals sales over a date range. Branch users see their own branch; admin and top management can compare all branches.",
          "Use the Export button to download the filtered data as a CSV for spreadsheets or accounting.",
        ],
      },
      {
        heading: "Stock movements",
        body: [
          "Reports → Stock movements is the audit trail of every stock event — intakes, sales, transfers, and returns — with from/to branches and dates. It answers “where did this item go?” Filter by date or branch and export to CSV.",
        ],
      },
    ],
  },
  {
    slug: "service-pricing",
    title: "Service pricing",
    summary:
      "Set and update your branch's prices for services so they prefill correctly on sales.",
    roles: ["admin", "branch_rep", "technical"],
    sections: [
      {
        heading: "What service pricing does",
        body: [
          "Service prices are per-branch — each branch sets its own rate for each service. When you add a service line to a sale, the saved price prefills automatically so your team doesn't have to type it every time.",
        ],
      },
      {
        heading: "Setting or updating a price",
        steps: [
          "Go to Pricing in the sidebar.",
          "Your branch's service list loads automatically. The Current price column shows what is saved; 'Not set' means no price is on file.",
          "Type the new price (in PHP, decimals allowed) in the New price field on the row you want to change.",
          "Click Save. The row updates immediately and a confirmation appears.",
        ],
        tips: [
          "You can only update prices for your own branch. The page always shows your branch — you cannot switch to another.",
          "Admins see a Branch selector at the top. Pick a branch and click Load to manage that branch's prices.",
        ],
      },
      {
        heading: "Clearing a price",
        steps: [
          "Find the service row with a saved price.",
          "Click Clear. The price is removed and the row shows 'Not set'.",
        ],
        body: [
          "Clearing a price means the service line on new sales will not prefill a value — staff will need to enter the price manually at point of sale.",
        ],
      },
      {
        heading: "Who can do this",
        body: [
          "Branch Representatives, Technical staff, and Admins can set and clear prices. Admins can manage any branch's prices; all other roles are limited to their own branch only.",
          "Top Management cannot edit prices — the page is not in their sidebar.",
        ],
      },
    ],
  },
  {
    slug: "chat",
    title: "Chat and messages",
    summary:
      "Message the whole organization, or discuss a specific transfer with the branches involved.",
    roles: ALL_ROLES,
    sections: [
      {
        heading: "Organization chat",
        steps: [
          "Click the round chat button at the bottom-right corner of any page.",
          "Type your message and press Enter to send (Shift+Enter adds a new line).",
          "Everyone in the organization — head office and all branches — sees the General channel, so use it for announcements and broad coordination.",
        ],
        tips: [
          "A red dot on the chat button means new messages arrived while the panel was closed.",
        ],
      },
      {
        heading: "Chatting with a specific branch",
        steps: [
          "Open the chat panel and use the channel selector at the top.",
          "Pick “Chat with ‹branch›” — for example, HQ picks Iloilo to open the HQ ↔ Iloilo channel.",
          "Only people at those two branches (plus admin and top management, who see all channels) can read that conversation.",
        ],
        tips: [
          "Branch channels are shared by everyone at both branches — there is no private person-to-person chat, so the whole branch stays in the loop.",
        ],
      },
      {
        heading: "Transfer message threads",
        body: [
          "Every transfer’s detail page has its own Messages thread, visible only to head office and the two branches on the transfer. Questions about a shipment belong there rather than in the organization channel — the context stays attached to the transfer, and the thread doubles as a record of what was agreed.",
        ],
      },
    ],
  },
  {
    slug: "admin-users",
    title: "Managing users and admin tools (admin)",
    summary:
      "Create accounts, assign roles and branches, deactivate users, review corrections, and clean up duplicate serials.",
    roles: ["admin"],
    sections: [
      {
        heading: "Adding a user",
        steps: [
          "Go to Admin → Users and add a new user with their name and email.",
          "Assign a role: Admin, Branch Representative, Top Management, or Technical.",
          "Branch representatives must be assigned to a branch — this controls which stock, sales, and customers they see.",
        ],
      },
      {
        heading: "Deactivating a user",
        body: [
          "Deactivate a user instead of deleting them when someone leaves. Deactivation blocks sign-in immediately and keeps their history (sales they recorded, requests they made) intact.",
        ],
      },
      {
        heading: "Which role should someone get?",
        tips: [
          "Give Admin only to head-office staff who receive stock and serve requests.",
          "Top Management is the safe read-only choice for owners and managers who need visibility without edit access.",
          "Technical is for repair staff — they see the repair and earmold queues across branches, but not sales or inventory.",
        ],
      },
      {
        heading: "Corrections log",
        body: [
          “Admin → Corrections log records every void, reversal, and serial correction made anywhere in the app, each with the reason given and a before/after snapshot of the record.”,
          “Filter by entity (sale, stock intake, stock, transfer, repair, earmold, serial) and date range. Click Details on a row to see the full before/after data.”,
        ],
        tips: [
          “Use this log to answer “who changed this and why” — it’s the audit trail for every correction, not just a list of current values.”,
        ],
      },
      {
        heading: "Activity log",
        body: [
          “Admin → Activity log is a low-level database audit trail showing every INSERT, UPDATE, and DELETE across all tables — stock, sales, transfers, repairs, customers, pricing, users, and more.”,
          “Filter by table, operation type, row ID, or date range. Results are paged (50 per page) and show the exact timestamp, the row that changed, and who made the change.”,
        ],
        tips: [
          “Use this when the Corrections log doesn’t have enough detail — for example, to trace exactly when a stock record was created or a pricing row was last touched.”,
          “This page is admin-only and not linked from the sidebar by default — access it directly via Admin → Activity.”,
        ],
      },
      {
        heading: "Duplicate serials",
        body: [
          "Admin → Duplicate serials lists stock rows that share the same serial number (case-insensitive), mostly left over from imported legacy data — new stock intakes reject duplicate serials automatically.",
          "Review each group and correct or remove the extra rows directly in Inventory → Stock; this page is a finder, not an editor.",
        ],
      },
    ],
  },
  {
    slug: "hearing-tests",
    title: "Hearing-test reviews (admin / top management)",
    summary:
      "Review hearing-test visits across every branch, check test files, and mark them reviewed.",
    roles: ["admin", "top_mgmt"],
    sections: [
      {
        heading: "How a visit becomes a hearing test",
        body: [
          "When a branch logs a customer visit, they can check “This is a hearing test” and attach the test file (see the “Customers and visits” guide). That visit then appears here, on Hearing tests, regardless of branch.",
        ],
      },
      {
        heading: "Reviewing a hearing test",
        steps: [
          "Go to Hearing tests. The list shows every hearing-test visit across all branches, with the patient, branch, visit date, whether a purchase was made, whether a sale is linked, and review status.",
          "Click Review on a visit to open its detail, and open the test file link(s) to check the results.",
          "Add review notes and click Mark reviewed.",
          "If the visit resulted in a sale, use the Link to sale control in the same dialog to attach it — this also marks the visit as a purchase. See the “Customers and visits” guide for how linking works.",
        ],
        tips: [
          "Unreviewed visits show an “Unreviewed” badge so nothing slips through; reviewed visits show who reviewed them and when.",
        ],
      },
    ],
  },
  {
    slug: "analytics",
    title: "Analytics (admin / top management)",
    summary:
      "Cross-branch sales performance: KPIs, best sellers, branch ranking, and trends.",
    roles: ["admin", "top_mgmt"],
    sections: [
      {
        heading: "Reading the dashboard",
        body: [
          "Go to Analytics. Filter by date range, branch, and product category at the top, then click Apply — Reset clears every filter back to the default range.",
          "The KPI row shows total revenue, total units, gross margin, branches with sales, and average sale value, each with a percentage change against the equivalent prior period.",
          "The trend chart plots monthly revenue over the selected range so seasonal patterns and growth are easy to spot.",
        ],
      },
      {
        heading: "Best sellers, services, and branches",
        body: [
          "Best-selling SKUs ranks products by units or revenue — click a column header to switch. Top services ranks services the same way. Branch performance compares every branch, including whether each branch moved up or down versus the prior period.",
        ],
        tips: [
          "Every table has its own Export CSV button, which downloads exactly the filtered data you’re looking at.",
        ],
      },
      {
        heading: "Who can see this",
        body: [
          "Analytics is read-only and visible to admin and top management only — it does not appear in the sidebar for branch representatives or technical staff.",
        ],
      },
    ],
  },
];

const guideBySlug = new Map(GUIDES.map((guide) => [guide.slug, guide]));

export function getGuide(slug: string): Guide | null {
  return guideBySlug.get(slug) ?? null;
}

export function guidesForRole(role: GuideRole): Guide[] {
  return GUIDES.filter((guide) => guide.roles.includes(role));
}

// Maps the current pathname to the most relevant guide, for the header
// help button. Order matters: first prefix match wins.
const PATH_GUIDES: [prefix: string, slug: string][] = [
  ["/inventory", "inventory"],
  ["/products", "inventory"],
  ["/suppliers", "inventory"],
  ["/sales", "sales"],
  ["/customers", "customers"],
  ["/hearing-tests", "hearing-tests"],
  ["/transfers", "transfers"],
  ["/requests", "stock-requests"],
  ["/repairs", "repairs"],
  ["/earmolds", "earmolds"],
  ["/pricing", "service-pricing"],
  ["/reports", "reports"],
  ["/analytics", "analytics"],
  ["/admin", "admin-users"],
];

export function guideSlugForPathname(pathname: string): string {
  for (const [prefix, slug] of PATH_GUIDES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return slug;
    }
  }
  return "getting-started";
}
