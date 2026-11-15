// The template gallery on Home. Each template is a complete, tested description of a real app —
// modules, roles, who sees what, numbering, rules, notifications and a look — that the AI turns
// into the app, the same way a typed description would be. A template is a head start, not a
// fixed app: once generated it's an ordinary project to change by describing what's different.
//
// domain: the DomainMotif artwork for the card; accent: the card's tint.

export const TEMPLATE_CATEGORIES = ["All", "Healthcare", "Education", "Finance", "Operations", "Sales", "Hospitality", "People", "Property", "Services"];

export const APP_TEMPLATES = [
  {
    id: "clinic",
    name: "Clinic & Appointments",
    category: "Healthcare",
    domain: "healthcare",
    accent: "#0d9488",
    blurb: "Patients, doctors, appointments and prescriptions for a small clinic.",
    modules: ["Patients", "Doctors", "Appointments", "Prescriptions"],
    roles: ["Admin", "Receptionist", "Doctor"],
    highlights: ["Doctors see only their own appointments", "Numbered appointments (APT-2026-0001)", "Doctor notified of new bookings"],
    prompt: `A clinic management app for a small multi-doctor clinic.

Modules:
- Patients: full name, phone, email, date of birth, gender (Male, Female, Other), blood group (A+, A-, B+, B-, AB+, AB-, O+, O-), address, allergies, emergency contact.
- Doctors: full name, email, phone, specialization (General Physician, Pediatrics, Dermatology, Orthopedics, Cardiology, Gynecology), consultation fee, available days, photo.
- Appointments: auto-numbered APT-{YYYY}-0001 resetting yearly, patient, doctor, appointment date, time slot, reason for visit, status (Booked, Checked In, Completed, Cancelled, No Show), consultation fee.
- Prescriptions: linked to an appointment, diagnosis, medicines, dosage instructions, follow-up date, notes.

Rules: appointment date can't be in the past when booking; consultation fee must be greater than zero; follow-up date must be after the appointment date.

Users sign up and log in with roles Admin, Receptionist and Doctor. Receptionists manage patients and appointments; doctors see only their own appointments and write prescriptions; Admins see everything and manage doctors.

When an appointment is booked, notify the doctor: "New appointment {patient} on {appointmentDate}".

Look: calm and clinical — soft teal, lots of white space, rounded cards, a sidebar layout.`,
  },
  {
    id: "coaching",
    name: "Coaching Institute",
    category: "Education",
    domain: "education",
    accent: "#7c3aed",
    blurb: "Batches, students, attendance, tests and fee collection.",
    modules: ["Courses", "Batches", "Students", "Attendance", "Tests", "Fee payments"],
    roles: ["Admin", "Teacher", "Accountant"],
    highlights: ["Teachers see only their batches", "Fee receipts numbered RCPT-0001", "Low-score alert to the teacher"],
    prompt: `A coaching institute app for running batches for competitive exams.

Modules:
- Courses: name, exam (JEE, NEET, UPSC, CAT, Foundation), duration in months, total fee, description.
- Batches: name, course, teacher, start date, timing (Morning, Afternoon, Evening, Weekend), capacity, status (Upcoming, Running, Completed).
- Students: full name, phone, parent phone, email, school or college, batch, admission date, status (Active, On Hold, Left).
- Attendance: batch, student, date, status (Present, Absent, Late).
- Tests: batch, student, test name, test date, maximum marks, marks obtained, remarks.
- Fee payments: receipt number auto-numbered RCPT-0001, student, amount, payment date, mode (Cash, UPI, Card, Bank Transfer), installment number, note.

Rules: marks obtained can't exceed maximum marks; payment amount must be greater than zero; batch capacity must be at least 1.

Users log in with roles Admin, Teacher and Accountant. Teachers see only the batches they teach (and those batches' attendance and tests); Accountants manage fee payments; Admins see everything.

When a test is saved with marks obtained below 40% of maximum marks, notify the teacher: "{student} scored {marksObtained}/{maximumMarks} in {testName}".

Look: friendly and energetic — violet with warm accents, card dashboard, top navigation.`,
  },
  {
    id: "upi-expenses",
    name: "UPI Expense Tracker",
    category: "Finance",
    domain: "fintech",
    accent: "#16a34a",
    blurb: "Track UPI spends, budgets and savings goals across accounts.",
    modules: ["Accounts", "Categories", "Transactions", "Budgets", "Savings goals"],
    roles: ["Member"],
    highlights: ["Everyone sees only their own money", "Monthly budgets per category", "Goal progress"],
    prompt: `A personal UPI expense and savings tracker that each person uses for their own money.

Modules:
- Accounts: name, bank name, UPI ID, type (Savings, Current, Credit Card, Wallet), opening balance.
- Categories: name, type (Expense, Income), icon colour, monthly limit.
- Transactions: account, category, amount, transaction date, type (Debit, Credit), UPI app (Google Pay, PhonePe, Paytm, BHIM, Other), merchant or person, reference number, note.
- Budgets: category, month, budget amount, alert when spent percent reaches (50, 75, 90, 100).
- Savings goals: goal name, target amount, saved so far, target date, status (On Track, Behind, Achieved).

Rules: amounts must be greater than zero; saved so far can't be more than the target amount; target date must be in the future when the goal is created.

People sign up and log in with the role Member. Every record belongs to the person who created it — each member sees only their own accounts, categories, transactions, budgets and goals.

Look: modern fintech — clean white surfaces, a deep green accent, big numbers on the dashboard, rounded cards.`,
  },
  {
    id: "inventory",
    name: "Inventory & Purchasing",
    category: "Operations",
    domain: "logistics",
    accent: "#ea580c",
    blurb: "Products, suppliers, purchase orders and stock movements.",
    modules: ["Products", "Suppliers", "Warehouses", "Purchase orders", "Stock movements"],
    roles: ["Admin", "Purchaser", "Storekeeper"],
    highlights: ["Numbered POs (PO-2026-0001)", "Approval over ₹50,000", "Manager notified for approvals"],
    prompt: `An inventory and purchasing app for a small distribution business.

Modules:
- Products: SKU, name, category (Raw Material, Finished Goods, Packaging, Spares), unit (Piece, Kg, Litre, Box), cost price, selling price, reorder level, photo.
- Suppliers: company name, contact person, phone, email, GSTIN, city, payment terms (Advance, 15 Days, 30 Days, 45 Days), rating.
- Warehouses: name, city, manager email.
- Purchase orders: auto-numbered PO-{YYYY}-0001 resetting yearly, supplier, order date, expected delivery date, total amount, status (Draft, Pending Approval, Approved, Ordered, Received, Cancelled), notes.
- Stock movements: product, warehouse, direction (In, Out, Adjustment), quantity, movement date, reference, reason.

Rules: quantity must be greater than zero; selling price must not be lower than cost price; expected delivery date can't be before the order date; a purchase order over 50000 must be Pending Approval or Approved before it can be Ordered.

Users log in with roles Admin, Purchaser and Storekeeper. Purchasers manage suppliers and purchase orders; Storekeepers record stock movements; Admins approve purchase orders and see everything.

When a purchase order is saved with status Pending Approval, notify admin: "PO {number} for {totalAmount} needs approval".

Look: industrial and efficient — orange accent on dark slate, dense tables, sidebar layout.`,
  },
  {
    id: "crm",
    name: "Sales CRM",
    category: "Sales",
    domain: "crm",
    accent: "#2563eb",
    blurb: "Leads, companies, deals and follow-ups for a sales team.",
    modules: ["Companies", "Contacts", "Leads", "Deals", "Activities"],
    roles: ["Sales Manager", "Sales Rep"],
    highlights: ["Reps see only their own deals", "Pipeline board by stage", "Manager told about big wins"],
    prompt: `A sales CRM for a B2B sales team.

Modules:
- Companies: name, industry (IT, Manufacturing, Retail, Healthcare, Finance, Education, Other), website, city, employee count, annual revenue.
- Contacts: full name, company, job title, email, phone, LinkedIn URL.
- Leads: name, company name, email, phone, source (Website, Referral, Cold Call, Event, LinkedIn, Ads), owner email, status (New, Contacted, Qualified, Unqualified), notes.
- Deals: title, company, contact, owner email, value, expected close date, stage (Prospecting, Proposal, Negotiation, Won, Lost), probability percent, lost reason.
- Activities: deal, type (Call, Meeting, Email, Demo, Follow-up), due date, done (yes/no), summary.

Rules: deal value must be greater than zero; probability must be between 0 and 100; a Lost deal needs a lost reason.

Users log in with roles Sales Manager and Sales Rep. Sales Reps see only leads and deals where they are the owner; Sales Managers see the whole pipeline.

When a deal is saved as Won, notify sales manager: "{title} won — {value}".

Look: sharp and professional — blue accent, crisp tables, a pipeline board for deals, top navigation.`,
  },
  {
    id: "hotel",
    name: "Boutique Hotel",
    category: "Hospitality",
    domain: "hospitality",
    accent: "#b45309",
    blurb: "Rooms, guests, reservations, housekeeping and invoices.",
    modules: ["Room types", "Rooms", "Guests", "Reservations", "Housekeeping", "Invoices"],
    roles: ["Manager", "Front Desk", "Housekeeping"],
    highlights: ["Numbered bookings (BKG-0001)", "Housekeeping sees only its tasks", "Elegant editorial look"],
    prompt: `A property management app for a 30-room boutique hotel.

Modules:
- Room types: name, base rate per night, maximum guests, amenities, photo.
- Rooms: room number, room type, floor, status (Available, Occupied, Cleaning, Maintenance).
- Guests: full name, phone, email, nationality, ID type (Passport, Aadhaar, Driving Licence), ID number, VIP (yes/no), preferences.
- Reservations: booking number auto-numbered BKG-0001, guest, room, check-in date, check-out date, adults, children, source (Walk-in, Website, Booking.com, Phone, Travel Agent), status (Confirmed, Checked In, Checked Out, Cancelled, No Show), total amount, special requests.
- Housekeeping: room, task (Clean, Deep Clean, Turndown, Inspect, Repair), assigned to email, due date, status (Pending, In Progress, Done).
- Invoices: reservation, room charges, food charges, other charges, tax, total, payment status (Unpaid, Partially Paid, Paid), paid on.

Rules: check-out must be after check-in; adults must be at least 1; total amount can't be negative.

Users log in with roles Manager, Front Desk and Housekeeping. Housekeeping staff see only the tasks assigned to them; Front Desk manages guests and reservations; Managers see everything including invoices.

When a reservation is saved as Checked Out, notify housekeeping: "Room {room} needs cleaning".

Look: warm and elegant — editorial serif headings, deep amber and cream, generous spacing.`,
  },
  {
    id: "hr",
    name: "HR & Leave",
    category: "People",
    domain: "hr",
    accent: "#db2777",
    blurb: "Employees, departments, leave requests and holidays.",
    modules: ["Departments", "Employees", "Leave types", "Leave requests", "Holidays"],
    roles: ["HR Admin", "Manager", "Employee"],
    highlights: ["Employees see only their own leave", "Numbered requests (LV-0001)", "Approver gets notified"],
    prompt: `An HR app for employee records and leave management at a 100-person company.

Modules:
- Departments: name, head email, location.
- Employees: employee code, full name, work email, phone, department, designation, date of joining, employment type (Full-time, Part-time, Contract, Intern), manager email, status (Active, On Notice, Exited), photo.
- Leave types: name (Casual, Sick, Earned, Maternity, Paternity, Unpaid), days per year, carry forward (yes/no).
- Leave requests: request number auto-numbered LV-0001, employee, leave type, start date, end date, number of days, reason, approver email, status (Pending, Approved, Rejected, Cancelled), decision note.
- Holidays: name, date, type (National, Regional, Optional).

Rules: end date can't be before start date; number of days must be at least 0.5; a Rejected request needs a decision note.

Users log in with roles HR Admin, Manager and Employee. Employees see only their own leave requests and profile; Managers see requests where they are the approver; HR Admins see everything.

When a leave request is saved as Pending, notify the approver: "{employee} requested leave from {startDate} to {endDate}".

Look: friendly and human — rose accent, soft rounded cards, people photos, sidebar layout.`,
  },
  {
    id: "rentals",
    name: "Property Rentals",
    category: "Property",
    domain: "property",
    accent: "#0f766e",
    blurb: "Properties, units, tenants, leases, rent and maintenance.",
    modules: ["Properties", "Units", "Tenants", "Leases", "Rent payments", "Maintenance requests"],
    roles: ["Owner", "Property Manager", "Tenant"],
    highlights: ["Tenants see only their own lease", "Rent receipts numbered RENT-0001", "Maintenance alerts"],
    prompt: `A rental property management app for a landlord with several buildings.

Modules:
- Properties: name, address, city, type (Apartment Building, Independent House, Commercial, PG/Hostel), total units, photo.
- Units: property, unit number, bedrooms, area in sq ft, monthly rent, security deposit, status (Vacant, Occupied, Under Repair).
- Tenants: full name, email, phone, ID proof type, ID number, occupation, emergency contact.
- Leases: unit, tenant, start date, end date, monthly rent, deposit paid, rent due day (1-28), status (Active, Notice Given, Ended).
- Rent payments: receipt number auto-numbered RENT-0001, lease, month, amount, paid on, mode (UPI, Bank Transfer, Cash, Cheque), late fee, status (Paid, Partial, Pending).
- Maintenance requests: unit, raised by email, category (Plumbing, Electrical, Carpentry, Appliance, Cleaning, Other), description, priority (Low, Medium, High, Urgent), status (Open, Assigned, Resolved, Closed), photo.

Rules: lease end date must be after start date; rent and deposit can't be negative; rent due day must be between 1 and 28.

Users log in with roles Owner, Property Manager and Tenant. Tenants see only their own lease, rent payments and maintenance requests; Property Managers handle units, tenants and maintenance; Owners see everything.

When a maintenance request is saved with priority Urgent, notify property manager: "Urgent {category} issue in unit {unit}".

Look: trustworthy real-estate — deep teal and stone, photo-forward cards, top navigation.`,
  },
  {
    id: "helpdesk",
    name: "IT Service Desk",
    category: "Services",
    domain: "projects",
    accent: "#4f46e5",
    blurb: "Tickets, assets, SLAs and a knowledge base for internal IT.",
    modules: ["Tickets", "Assets", "Knowledge articles", "Agents"],
    roles: ["IT Admin", "Agent", "Requester"],
    highlights: ["Requesters see only their tickets", "Numbered tickets (TKT-2026-0001)", "Agent notified on assignment"],
    prompt: `An internal IT service desk for a company's employees.

Modules:
- Agents: full name, email, team (Hardware, Software, Network, Access), on shift (yes/no).
- Assets: asset tag, type (Laptop, Desktop, Monitor, Phone, Printer, License), model, serial number, assigned to email, purchase date, warranty until, status (In Use, In Stock, Repair, Retired).
- Tickets: ticket number auto-numbered TKT-{YYYY}-0001 resetting yearly, title, description, requester email, category (Hardware, Software, Network, Access Request, Other), priority (Low, Medium, High, Critical), asset, assigned agent email, status (New, Assigned, In Progress, Waiting on User, Resolved, Closed), due date, resolution notes.
- Knowledge articles: title, category, body, published (yes/no).

Rules: a Resolved or Closed ticket needs resolution notes; warranty date can't be before the purchase date.

Users log in with roles IT Admin, Agent and Requester. Requesters see only tickets they raised; Agents see tickets assigned to them; IT Admins see everything and manage assets.

When a ticket is saved with an assigned agent, notify the assigned agent: "Ticket {ticketNumber}: {title} ({priority})".

Look: focused and technical — indigo accent, compact tables, a board view for tickets by status, sidebar layout.`,
  },
  {
    id: "gym",
    name: "Gym & Memberships",
    category: "Services",
    domain: "media",
    accent: "#dc2626",
    blurb: "Members, plans, check-ins, classes and payments for a gym.",
    modules: ["Plans", "Members", "Trainers", "Classes", "Check-ins", "Payments"],
    roles: ["Owner", "Front Desk", "Trainer"],
    highlights: ["Trainers see only their classes", "Membership numbers (MEM-0001)", "Bold, high-energy look"],
    prompt: `A gym and fitness studio management app.

Modules:
- Plans: name, duration in months, price, includes personal training (yes/no), description.
- Members: membership number auto-numbered MEM-0001, full name, phone, email, date of birth, gender, plan, start date, end date, status (Active, Frozen, Expired), goal (Weight Loss, Muscle Gain, Fitness, Rehab), photo.
- Trainers: full name, email, phone, speciality (Strength, Yoga, CrossFit, Zumba, Cardio), photo.
- Classes: name, trainer, day of week, start time, capacity, room.
- Check-ins: member, check-in date, time, class.
- Payments: member, plan, amount, paid on, mode (UPI, Card, Cash), status (Paid, Pending, Refunded).

Rules: membership end date must be after the start date; class capacity must be at least 1; payment amount must be greater than zero.

Users log in with roles Owner, Front Desk and Trainer. Trainers see only their own classes; Front Desk manages members, check-ins and payments; Owners see everything.

Look: bold and high-energy — black and red, chunky headings, big numbers on the dashboard.`,
  },
];

export function templatesIn(category, query = "") {
  const q = query.trim().toLowerCase();
  return APP_TEMPLATES.filter((t) =>
    (category === "All" || t.category === category) &&
    (!q || [t.name, t.blurb, t.category, ...t.modules].some((s) => s.toLowerCase().includes(q)))
  );
}
