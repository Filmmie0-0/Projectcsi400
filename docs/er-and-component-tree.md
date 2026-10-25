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

## Dormitory & Wholesale (database/services/04_store_db.sql)

users(owner) 1:N dormitories
dormitories 1:N spaces
bookings(APPROVED) 1:1 stores        (stores.dormitory_id มาจาก booking → space)
stores 1:N product_categories, products
products 1:N product_price_tiers     (ราคาส่งขั้นบันได: min_qty → unit_price)
dormitories 1:N api_keys             (store_id NULL = ใช้ได้ทุกร้านในหอ)
stores 1:N external_orders
api_keys 1:N external_orders         (UNIQUE api_key_id + external_ref กันออเดอร์ซ้ำ)
external_orders 1:N external_order_items N:1 products

Triggers: ใส่ external_order_items → เลือกราคา tier + ตรวจสต็อก → OUTBOUND ใน inventory_transactions (ตัดสต็อก)
          ยกเลิกออเดอร์ → INBOUND คืนสต็อก, billing_status = VOID (ยกเลิกไม่ได้ถ้า BILLED/PAID)
Views: v_store_catalog (สินค้า+สต็อกสำหรับ API), v_dorm_room_billing (ยอดรวมบิลค่าหอ ต่อห้อง/เดือน)

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
