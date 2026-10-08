// Location 1: today's figures from the Wallmob home page boxes.
export interface ServiceAData {
  revenueToday: number | null;
  revenueLastYearSameWeekday: number | null;
  revenueChangePercent: number | null;
  productsSoldToday: number | null;
  grossMarginPercent: number | null;
  customersToday: number | null;
}

// Location 2: the "Dagens salg" widget on the NordPay dashboard.
export interface ServiceBData {
  salesToday: number | null;
  ordersToday: number | null;
}

// A birthday child as shown in FunButler's check-in list, e.g. "David 5 år".
export interface BirthdayChild {
  name: string;
  age: number | null;
  birthDate: string | null; // YYYY-MM-DD
}

// One line on a booking's order, as in FunButler's booking view.
export interface OrderRow {
  name: string; // "Extremerommet + Lek (16:30-18:30)", "Pizza med ost", …
  quantity: number;
  unitPrice: number; // kr incl. VAT
  total: number;
}

export interface Booking {
  bookingNumber: number;
  time: string;
  endTime: string;
  name: string;
  guests: number;
  birthdayChildren: BirthdayChild[];
  price: number | null;
  customerName: string | null; // booker's first name
  // The booker's contact details. Personal data: the backend must require a login before it is put online.
  customer: { firstName: string | null; lastName: string | null; phone: string | null; email: string | null };
  createdAt: string | null; // ISO, when the booking was made
  orderRows: OrderRow[];
  paid: boolean; // FunButler has registered a payment
  staffComment: string | null;
}

export interface BookingsResult {
  date: string;
  bookings: Booking[];
}

// Each section is null when that service failed, so one broken site doesn't break the whole dashboard.
export interface DashboardData {
  date: string;
  updatedAt: string;
  serviceA: ServiceAData | null;
  serviceB: ServiceBData | null;
  today: (BookingsResult & { bookingCount: number; guestCount: number }) | null;
  errors: string[];
}

// Sales per opening hour today. A location's values are null when that service failed.
export interface HourlySales {
  hour: number; // 10 = 10:00–10:59
  extandaGo: number | null;
  nordpay: number | null;
}

export interface HourlySalesData {
  date: string;
  updatedAt: string;
  openHour: number;
  closeHour: number;
  hours: HourlySales[];
  topSellers: { name: string; revenue: number }[] | null; // Extanda Go employees by sales, best first; null if it failed
  errors: string[];
}

// One step of MET Norway forecast. symbol is MET's code, e.g. "partlycloudy_day" or "lightrain".
export interface WeatherHour {
  time: string; // ISO, start of the period
  period: 1 | 6; // hours this step covers (MET switches from 1 to 6 after ~2.5 days)
  temperature: number; // °C
  windSpeed: number; // m/s
  symbol: string;
  precipitation: number; // mm during the period
}

// now is the current hour; hours is the whole forecast after it (about 9 days).
export interface WeatherData {
  updatedAt: string;
  now: WeatherHour;
  hours: WeatherHour[];
}

// One Planday shift. name is null for an open (unassigned) shift.
export interface StaffShift {
  date: string; // YYYY-MM-DD
  name: string | null;
  group: string | null; // e.g. "Kontor", "Kjøkken", "Resepsjon"
  start: string; // "16:00"
  end: string;
  status: string; // Planday status, e.g. "Assigned", "Open", "PunchclockStarted", "PunchclockFinished"
  punchIn: string | null; // "15:52" once clocked in
  punchOut: string | null;
}
