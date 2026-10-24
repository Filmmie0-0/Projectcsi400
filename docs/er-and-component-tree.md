# ER Summary

users 1:1 user_profiles
users(owner) 1:N spaces
spaces 1:N space_images
spaces 1:N bookings
users(tenant) 1:N bookings
bookings 1:N payments
bookings 1:N booking_status_logs
users(tenant) 1:N product_categories, products
products 1:N inventory_transactions
bookings 1:N inventory_transactions
products M:N bookings  (via inventory_balances)
tenants M:N spaces     (via bookings)

# Component Tree (หลัก)

DashboardLayout
 ├─ Sidebar (menu ตาม role) ─ Topbar ─ <Outlet/>

SpaceSearchPage: PageHeader, SearchBar, SpaceFilterPanel, SpaceCard[], Pagination
SpaceDetailPage: SpaceGallery, SpaceInfoBlock, SpaceMap, ReviewList, BookingForm (sticky)
AdminDashboardPage: StatCard x4, RevenueChart, PendingPaymentTable, RecentActivityList
BookingRequestsPage: Tabs, BookingTable, BookingReviewDrawer(SlipPreview, BookingActionBar)
BookingDetailPage (tenant): BookingSummaryCard, BookingStatusTimeline, SlipUploadCard, PaymentHistoryTable
ProductListPage: LowStockAlert, SearchBar, ProductTable, Pagination
StockMovementPage: Tabs(Inbound/Outbound/Adjust), StockInOutForm, TransactionTable
