# ROSE Flower Shop API Reference

Base URL: `/api/v1` (for example `http://localhost:5000/api/v1`). All bodies are JSON (`Content-Type: application/json`, max 1 MB).

## Conventions

**Authentication.** Log in with `POST /auth/login` and send `Authorization: Bearer <token>` on protected calls. Tokens last 1 hour by default (`JWT_EXPIRE_IN`). A token stops working immediately after logout, password change, block or role change. The access column in each table uses these labels:

| Label | Who |
|---|---|
| P | Public |
| A | Any logged-in user |
| C | Customer |
| CA | Customer (own) or Admin |
| CA* | Owner or Admin |
| F | Approved florist |
| F* | Any florist |
| AD | Admin |
| CF | Customer or Florist |
| S | Stripe signature |

**Success envelope.** `{ "success": true, "message": "...", "data": { ... } }`. Exceptions: payments, chat REST and chatbot return their fields at the top level (for example `{ "success": true, "items": [...], "pagination": {...} }`).

**Error envelope.** `{ "success": false, "message": "...", "errors": [{ "field": "body.email", "message": "..." }] }` (`errors` appears on validation failures). Stack traces are never returned.

| Status | Meaning |
|---|---|
| 400 | Malformed JSON, bad business input (for example refund above balance) |
| 401 | Missing, invalid or expired token; wrong credentials |
| 403 | Authenticated but not allowed (wrong role, other user's payment, blocked account, unapproved florist) |
| 404 | Not found, **or** someone else's resource (orders, tickets, conversations return 404 to hide existence) |
| 409 | Conflict: duplicate, illegal state transition, insufficient stock, already processed |
| 413 | Body larger than 1 MB |
| 422 | Validation failed (first problem in `message`, all in `errors`) |
| 429 | Rate limited |
| 500 / 502 / 503 | Server error / payment provider error / payments not configured |

**Validation rules that apply everywhere.** IDs are 24-character hex ObjectIds. Unknown body fields are silently dropped (you cannot set `role`, `price`, `total`, `status` and similar through endpoints that do not list them). Pagination: `page` 1-10000, `limit` 1-100 unless stated; responses include `pagination: { total, page, limit, pages }`.

**Rate limits.** Global: 300 requests per 15 minutes per IP on `/api`. Login and register: 10 failed attempts per 15 minutes per IP; login also 20 failed attempts per 15 minutes per e-mail; register 20 per hour per IP. Chatbot messages: 20 per minute per user. Support tickets: 10 per hour per user; ticket replies 20 per minute. Limit headers: `RateLimit-*`.

**Money.** Amounts are numbers in EGP. Delivery fee is a fixed 40 EGP; tax rate is 0.

**Health.** `GET /health` (no prefix, public) returns 200 or 503 depending on the database.

## Order lifecycle
`PLACED → CONFIRMED → PREPARING → READY → OUT_FOR_DELIVERY → DELIVERED`; cancellation is possible from PLACED, CONFIRMED and PREPARING (customers only until CONFIRMED). Stock is reserved at PLACED, deducted at CONFIRMED, ingredients are consumed at PREPARING, and everything is returned on cancellation. COD orders become PAID on delivery. Online orders are paid through Stripe: `POST /payments/initiate` → confirm with `clientSecret` in Stripe.js → the webhook marks the order PAID.

## Real-time chat (Socket.IO)
Connect to `/socket.io` with `auth: { token }` (same JWT). The session is re-validated during the connection. Events (client → server, with an optional ack callback `{ ok, ... }`):

| Event | Payload | Notes |
|---|---|---|
| `conversation:join` | `{ conversationId }` | Ack returns the last 50 messages visible to your side |
| `conversation:leave` | `{ conversationId }` | |
| `message:send` | `{ conversationId, body (<=2000), attachments? (<=5 http(s) urls), visibleTo? (admin only) }` | 20 per 10 s per socket. Customer and florist messages are visible to their own side and the admin only. |
| `typing:start` / `typing:stop` | `{ conversationId }` | Must have joined |
| `message:read` | `{ conversationId, messageIds[] (<=200) }` | |

Server → client: `message:new`, `typing:update`, `message:read`, and `presence:update` (admin only). The admin mediates: customers and florists never see each other's messages or identities.

---

## Auth

### `POST /api/v1/auth/register`
Register a customer. **Access:** Public.

- Body: `name: string 2-60`, `email: string`, `password: string 8-72, letter + digit`, `phone?: +?7-15 digits`
- 201 {user}. Role is always `customer`. 409 if e-mail exists. Rate limited.

### `POST /api/v1/auth/register/florist`
Apply as a florist (pending admin approval). **Access:** Public.

- Body: `name`, `email`, `password`, `phone: +?7-15 digits`, `businessName: 2-120`, `licenseNumber: 3-60`, `nationalId?: 5-30`, `businessAddress: 5-250`, `documents: [{label: 2-80, url: http(s)}] 1-5`
- 201 {user} with floristStatus=PENDING.

### `POST /api/v1/auth/login`
Log in. **Access:** Public.

- Body: `email`, `password`
- 200 {token, user}. 401 "Invalid Email or Password" for unknown e-mail or wrong password; 403 if deactivated. Rate limited per IP and per e-mail (429).

### `POST /api/v1/auth/logout`
Log out (invalidates all tokens of the user). **Access:** Any logged-in user.

- 200.

### `GET /api/v1/auth/me`
Current user. **Access:** Any logged-in user.

- 200 {user}.

### `PATCH /api/v1/auth/me`
Update own name/phone. **Access:** Any logged-in user.

- Body: `name?: 2-60`, `phone?`
- At least one field. Other fields are ignored.

### `PATCH /api/v1/auth/change-password`
Change password. **Access:** Any logged-in user.

- Body: `currentPassword`, `newPassword: 8-72, letter + digit`
- 200 {token} (a new token; all old tokens are invalidated). 401 wrong current password; 422 if same.


## Products

### `GET /api/v1/products`
List visible products. **Access:** Public.

- Query: `page: int 1-10000 (default 1)`, `limit: int 1-50 (default 12)`, `category?: ObjectId`, `featured?: true|false`, `minPrice?/maxPrice?: number`, `inStock?: true|false`, `tag?: string`, `occasion?: string`, `search?: string 1-100 (text search)`, `sort?: price_asc|price_desc|newest|popular|rating`
- 200 {items, pagination}. Hides florist, recipe, reservedQuantity, approval fields.

### `GET /api/v1/products/:slug`
Product by slug. **Access:** Public.

- Path: `slug` (ObjectId or slug)
- 404 if inactive or not approved.

### `GET /api/v1/products/:productId/reviews`
Approved reviews of a product. **Access:** Public.

- Path: `productId` (ObjectId or slug)
- Query: `page`, `limit: 1-50 (default 10)`, `rating?: 1-5`
- 200 {items, distribution, pagination}. Reviewer shown by first name only.

### `GET /api/v1/products/admin/low-stock`
Low-stock products. **Access:** Admin.


### `GET /api/v1/products/admin/all`
List all products. **Access:** Admin.

- Query: `page`, `limit`, `category?`, `florist?`, `approvalStatus?: PENDING|APPROVED|REJECTED`, `isActive?`, `search?`

### `GET /api/v1/products/admin/:id`
Get any product. **Access:** Admin.

- Path: `id` (ObjectId or slug)

### `POST /api/v1/products`
Create product. **Access:** Admin.

- Body: `title: 2-120`, `description: 10-5000`, `category: ObjectId`, `price: 0-1e6`, `discountPrice?: <= price`, `sizes?: [{name: Standard\|Deluxe\|Premium, priceModifier, stemMultiplier 1-10}] 1-3`, `shortDescription?`, `careInstructions?`, `tags?, occasions?: string[] <=20`, `images?: [{url, alt?, isPrimary?}] <=10`, `recipe?: [{inventoryItem: ObjectId, quantity: int 1-10000}] <=30`, `lowStockThreshold?`, `stockQuantity?: int 0-1e6`, `isFeatured?`, `isActive?`, `florist?: ObjectId (approved florist)`
- 201 {product}. Slug is generated.

### `PATCH /api/v1/products/:id`
Update product (partial). **Access:** Admin.

- Path: `id` (ObjectId or slug)
- Body: `any of: title, description, category, price, discountPrice, sizes, tags, occasions, images, recipe, lowStockThreshold, isFeatured, isActive, florist (nullable)`
- Stock, slug, ratings and sold count cannot be set here.

### `PATCH /api/v1/products/:id/stock`
Set absolute stock. **Access:** Admin.

- Path: `id` (ObjectId or slug)
- Body: `quantity: int 0-1e6`
- 409 if below the reserved amount.

### `PATCH /api/v1/products/:id/featured`
Toggle featured. **Access:** Admin.

- Path: `id` (ObjectId or slug)

### `PATCH /api/v1/products/:id/approval`
Approve or reject a florist product. **Access:** Admin.

- Path: `id` (ObjectId or slug)
- Body: `status: APPROVED\|REJECTED`, `note?: <=300`

### `DELETE /api/v1/products/:id`
Soft-delete (deactivate). **Access:** Admin.

- Path: `id` (ObjectId or slug)


## Categories

### `GET /api/v1/categories`
Active categories. **Access:** Public.

- 200 {count, categories}.

### `GET /api/v1/categories/:slug`
Category by slug. **Access:** Public.

- Path: `slug` (ObjectId or slug)

### `GET /api/v1/categories/admin/all`
All categories incl. inactive. **Access:** Admin.


### `POST /api/v1/categories`
Create. **Access:** Admin.

- Body: `name: 2-100`, `description?: <=300\|null`, `image?: <=500\|null`, `displayOrder?: int >=0`
- 409 if name exists.

### `PATCH /api/v1/categories/:id`
Update (partial). **Access:** Admin.

- Path: `id` (ObjectId or slug)
- Body: `name?, description?, image?, displayOrder?, isActive?`

### `PATCH /api/v1/categories/:id/status`
Toggle active. **Access:** Admin.

- Path: `id` (ObjectId or slug)

### `PATCH /api/v1/categories/:id/order`
Set display order. **Access:** Admin.

- Path: `id` (ObjectId or slug)
- Body: `displayOrder: int >=0`

### `PATCH /api/v1/categories/:id/restore`
Reactivate. **Access:** Admin.

- Path: `id` (ObjectId or slug)

### `DELETE /api/v1/categories/:id`
Soft-delete (deactivate). **Access:** Admin.

- Path: `id` (ObjectId or slug)


## Cart

### `GET /api/v1/cart`
Own cart with summary. **Access:** Customer.

- 200 {cart:{items, summary:{subtotal, itemsCount, currency}}}.

### `GET /api/v1/cart/total`
Cart totals. **Access:** Customer.

- 200 {subtotal, total, currency, itemsCount}.

### `POST /api/v1/cart/items`
Add a product. **Access:** Customer.

- Body: `productId: ObjectId`, `quantity: int 1-100`
- 409 if over available stock; 422 if total > 100.

### `PATCH /api/v1/cart/items/:productId`
Set quantity. **Access:** Customer.

- Path: `productId` (ObjectId or slug)
- Body: `quantity: int 1-100`
- 404 if not in cart.

### `DELETE /api/v1/cart/items/:productId`
Remove a product. **Access:** Customer.

- Path: `productId` (ObjectId or slug)

### `DELETE /api/v1/cart`
Clear cart. **Access:** Customer.



## Orders

### `POST /api/v1/orders`
Place an order. **Access:** Customer.

- Body: `items: [{productId, quantity: int 1-50, size?: Standard\|Deluxe\|Premium, cardMessage?: <=300, wrappingNote?: <=300}] 1-30`, `delivery: {recipientName 2-80, recipientPhone, addressLine1 3-200, addressLine2?, city 2-80, postalCode?, country?: 2 letters, deliveryDate: ISO date not in the past, slot: 09:00-12:00\|12:00-15:00\|15:00-18:00\|18:00-21:00, notes?: <=300}`, `paymentMethod: COD\|ONLINE`, `couponCode?: <=30`
- 201 {order}. Prices, discount, delivery fee (40 EGP) and total are computed server-side. Stock is reserved. 409 on insufficient stock or unavailable coupon.

### `GET /api/v1/orders/my`
Own orders. **Access:** Customer.

- Query: `page`, `limit: 1-50 (default 10)`, `status?`
- 200 {items, pagination}.

### `GET /api/v1/orders/:id`
Order detail. **Access:** Customer (own) or Admin.

- Path: `id` (ObjectId or slug)
- Customers see only their own (404 otherwise). Admin sees full detail incl. customer and florist.

### `GET /api/v1/orders/:id/track`
Tracking timeline. **Access:** Customer (own) or Admin.

- Path: `id` (ObjectId or slug)

### `PATCH /api/v1/orders/:id/cancel`
Cancel an order. **Access:** Customer (own) or Admin.

- Path: `id` (ObjectId or slug)
- Body: `reason?: <=300`
- Customer: only PLACED or CONFIRMED. Releases stock/coupon; paid ONLINE orders are refunded. 409 otherwise.

### `GET /api/v1/orders/florist/queue`
Assigned orders to prepare. **Access:** Approved florist.

- Fulfilment projection only (no customer, address or prices).

### `PATCH /api/v1/orders/:id/prep-status`
Set PREPARING or READY. **Access:** Approved florist.

- Path: `id` (ObjectId or slug)
- Body: `status: PREPARING\|READY`, `note?: <=200`
- Only on orders assigned to the caller.

### `GET /api/v1/orders`
List all orders. **Access:** Admin.

- Query: `page`, `limit`, `status?`, `floristId?`, `customerId?`, `unassigned?: true|false`, `date?: date`

### `GET /api/v1/orders/admin/stats`
Order statistics. **Access:** Admin.


### `PATCH /api/v1/orders/:id/status`
Change status. **Access:** Admin.

- Path: `id` (ObjectId or slug)
- Body: `status: CONFIRMED\|PREPARING\|READY\|OUT_FOR_DELIVERY\|DELIVERED\|CANCELLED`, `note?: <=200`
- Transitions: PLACED→CONFIRMED|CANCELLED, CONFIRMED→PREPARING|CANCELLED, PREPARING→READY|CANCELLED, READY→OUT_FOR_DELIVERY, OUT_FOR_DELIVERY→DELIVERED. Otherwise 409.

### `PATCH /api/v1/orders/:id/assign`
Assign an approved florist. **Access:** Admin.

- Path: `id` (ObjectId or slug)
- Body: `floristId: ObjectId`

### `PATCH /api/v1/orders/:id/payment`
Manually set ONLINE payment status. **Access:** Admin.

- Path: `id` (ObjectId or slug)
- Body: `paymentStatus: PAID\|FAILED`, `transactionRef?: <=100`
- 409 for COD, cancelled, refunded orders, or PAID→FAILED.


## Payments

Payment and chat endpoints return fields at the top level (`success`, plus e.g. `payment`, `items`) instead of inside `data`.

### `POST /api/v1/payments/initiate`
Start a Stripe payment for an ONLINE order. **Access:** Customer.

- Body: `orderId: ObjectId`
- 201 {paymentId, clientSecret, amount, currency}. Idempotent per order. 403 not your order; 409 already paid.

### `GET /api/v1/payments/order/:orderId`
Payment of an order. **Access:** Owner or Admin.

- Path: `orderId` (ObjectId or slug)
- Owner or admin (403 otherwise). Client secret is never returned.

### `GET /api/v1/payments`
List payments. **Access:** Admin.

- Query: `page`, `limit`, `status?`, `provider?: STRIPE|PAYMOB|FAWRY|COD`, `customerId?`, `from?/to?: date`
- 200 {items, pagination}.

### `POST /api/v1/payments/order/:orderId/refund`
Refund (full when amount omitted). **Access:** Admin.

- Path: `orderId` (ObjectId or slug)
- Body: `amount?: >0`, `reason?: <=300`
- 400 if above refundable amount; 409 if not refundable.

### `POST /api/v1/payments/webhook/stripe`
Stripe webhook (signature verified). **Access:** Stripe signature.

- Body: `raw Stripe event body`
- Header `Stripe-Signature` required (400 otherwise). Handles payment_intent.succeeded, payment_intent.payment_failed, charge.refunded. Duplicate and out-of-order events are ignored. Not for client use.


## Coupons

### `POST /api/v1/coupons/validate`
Preview a coupon against the cart. **Access:** Customer.

- Body: `code: 3-20 chars A-Z 0-9 _ -`
- 200 {code, discountType, discountValue, subtotal, discount, subtotalAfterDiscount}. 400 if invalid, expired, used up or below minimum.

### `GET /api/v1/coupons`
List coupons. **Access:** Admin.

- Query: `page`, `limit`, `isActive?`, `expired?`, `search?`

### `POST /api/v1/coupons`
Create. **Access:** Admin.

- Body: `code`, `description?`, `discountType: PERCENTAGE\|FIXED`, `discountValue: >0 (<=100 for PERCENTAGE)`, `maxDiscountAmount?: number\|null`, `minOrderAmount?`, `startDate?`, `expiryDate: after start`, `usageLimit?: int\|null`, `usageLimitPerCustomer?: int (default 1)`, `isActive?`
- 409 if code exists.

### `GET /api/v1/coupons/:id`
Get. **Access:** Admin.

- Path: `id` (ObjectId or slug)

### `PATCH /api/v1/coupons/:id`
Update (code is immutable). **Access:** Admin.

- Path: `id` (ObjectId or slug)
- Body: `any of the create fields except code`

### `PATCH /api/v1/coupons/:id/status`
Toggle active. **Access:** Admin.

- Path: `id` (ObjectId or slug)

### `DELETE /api/v1/coupons/:id`
Delete. **Access:** Admin.

- Path: `id` (ObjectId or slug)
- 409 if already used; deactivate instead.


## Reviews

### `POST /api/v1/reviews`
Review a purchased product. **Access:** Customer.

- Body: `productId`, `orderId`, `rating: int 1-5`, `comment: 3-1000`, `title?: <=120`
- Only for DELIVERED orders containing the product. 409 if already reviewed.

### `GET /api/v1/reviews/my`
Own reviews. **Access:** Customer.

- Query: `page`, `limit: 1-50`

### `GET /api/v1/reviews/:id`
One review. **Access:** Customer (own) or Admin.

- Path: `id` (ObjectId or slug)
- Owner or admin.

### `PATCH /api/v1/reviews/:id`
Edit own review. **Access:** Customer.

- Path: `id` (ObjectId or slug)
- Body: `rating?`, `comment?`, `title?`

### `DELETE /api/v1/reviews/:id`
Delete (owner or admin). **Access:** Customer (own) or Admin.

- Path: `id` (ObjectId or slug)

### `POST /api/v1/reviews/:id/helpful`
Mark helpful (one vote, not your own). **Access:** Customer.

- Path: `id` (ObjectId or slug)
- 409 if own or already voted.

### `GET /api/v1/reviews/admin/all`
All reviews. **Access:** Admin.

- Query: `page`, `limit`, `status?`, `productId?`, `customerId?`, `rating?`

### `PATCH /api/v1/reviews/:id/moderate`
Approve or reject. **Access:** Admin.

- Path: `id` (ObjectId or slug)
- Body: `status: APPROVED\|REJECTED`, `note?: <=300`


## Wishlist

### `GET /api/v1/wishlist`
Own wishlist. **Access:** Customer.

- Query: `page`, `limit: 1-50 (default 20)`

### `GET /api/v1/wishlist/check/:productId`
Is the product in the wishlist. **Access:** Customer.

- Path: `productId` (ObjectId or slug)
- 200 {inWishlist}.

### `POST /api/v1/wishlist/:productId`
Add. **Access:** Customer.

- Path: `productId` (ObjectId or slug)
- 201. 409 if present.

### `DELETE /api/v1/wishlist/:productId`
Remove. **Access:** Customer.

- Path: `productId` (ObjectId or slug)
- 404 if absent.

### `DELETE /api/v1/wishlist`
Clear. **Access:** Customer.



## Florist

### `GET /api/v1/florist/profile`
Own profile and approval status. **Access:** Any florist.

- Available to pending and rejected florists.

### `PUT /api/v1/florist/verification`
Submit or re-submit verification. **Access:** Any florist.

- Body: `businessName`, `licenseNumber`, `nationalId?`, `businessAddress`, `documents: [{label, url}] 1-5`
- 409 once approved. Resets status to PENDING.

### `GET /api/v1/florist/dashboard`
Dashboard counters. **Access:** Approved florist.

- All endpoints below require an approved florist.

### `PATCH /api/v1/florist/profile`
Update profile. **Access:** Approved florist.

- Body: `bio?, specialties?, yearsExperience?, shiftStart?, shiftEnd? (HH:MM), avatar?: url`

### `PATCH /api/v1/florist/availability`
Toggle availability. **Access:** Approved florist.


### `GET /api/v1/florist/products`
Own products. **Access:** Approved florist.

- Query: `page`, `limit: 1-50`, `category?`, `search?`

### `POST /api/v1/florist/products`
Create product (starts PENDING). **Access:** Approved florist.

- Body: `same fields as admin create, without isFeatured/isActive/florist`
- 201.

### `GET /api/v1/florist/products/:productId`
Own product. **Access:** Approved florist.

- Path: `productId` (ObjectId or slug)

### `PATCH /api/v1/florist/products/:productId`
Update own product. **Access:** Approved florist.

- Path: `productId` (ObjectId or slug)
- Body: `same fields as admin update`
- 403 if changing price/sizes of an approved product.

### `PATCH /api/v1/florist/products/:productId/stock`
Set stock of own product. **Access:** Approved florist.

- Path: `productId` (ObjectId or slug)
- Body: `quantity: int 0-1e6`

### `DELETE /api/v1/florist/products/:productId`
Deactivate own product. **Access:** Approved florist.

- Path: `productId` (ObjectId or slug)

### `GET /api/v1/florist/inventory`
Read-only ingredients used by own products. **Access:** Approved florist.

- No cost or supplier data.

### `GET /api/v1/florist/orders`
Assigned orders (fulfilment view). **Access:** Approved florist.

- Query: `page`, `limit: 1-50`, `status?`


## Support tickets

### `POST /api/v1/support/tickets`
Open a ticket to the admin team. **Access:** Customer or Florist.

- Body: `subject: 3-150`, `message: 1-2000`, `category?: GENERAL\|ORDER\|COMPLAINT\|PRODUCT\|ACCOUNT\|FULFILLMENT`, `orderId?: your own (customer) or assigned (florist) order`
- 201. Limited to 10 per hour.

### `GET /api/v1/support/tickets`
Own tickets. **Access:** Customer or Florist.

- Query: `page`, `limit: 1-50 (default 10)`, `status?: OPEN|IN_PROGRESS|RESOLVED|CLOSED`

### `GET /api/v1/support/tickets/:id`
Own ticket with messages. **Access:** Customer or Florist.

- Path: `id` (ObjectId or slug)
- Staff identity is hidden; admin replies appear as `support`.

### `POST /api/v1/support/tickets/:id/messages`
Reply. **Access:** Customer or Florist.

- Path: `id` (ObjectId or slug)
- Body: `message: 1-2000`
- Re-opens a resolved ticket; 409 if closed. 20 per minute.


## Chat (REST)

### `GET /api/v1/chat/conversations`
Own conversations (admin: all). **Access:** Any logged-in user.

- Query: `page`, `limit: 1-50`, `status?: OPEN|RESOLVED|CLOSED`
- 200 {items, pagination}. Each item has lastMessage and unreadCount.

### `GET /api/v1/chat/conversations/:conversationId/messages`
Messages visible to the caller's side. **Access:** Any logged-in user.

- Path: `conversationId` (ObjectId or slug)
- Query: `page`, `limit: 1-100 (default 50)`
- 404 for conversations you are not part of.

### `DELETE /api/v1/chat/conversations/:conversationId`
Close (admin: delete with messages). **Access:** Any logged-in user.

- Path: `conversationId` (ObjectId or slug)
- Admin gets 204.

### `GET /api/v1/chat/presence/online`
Online user ids. **Access:** Admin.



## Chatbot

Customer only. Responses are top-level (`sessionId`, `reply`, ...).

### `POST /api/v1/chatbot/messages`
Send a message to the bot. **Access:** Customer.

- Body: `message: 1-1000`
- 201 {sessionId, status, reply:{body, intent, payload, confidence}}. Intents: SUPPORT (hands off to a human chat), ORDER_STATUS, PRODUCT_SEARCH, RECOMMENDATION, FAQ, then optional LLM fallback. 20 per minute.

### `GET /api/v1/chatbot/history`
Latest session transcript. **Access:** Customer.

- Query: `page`, `limit: 1-100 (default 50)`

### `POST /api/v1/chatbot/close`
Close the active session. **Access:** Customer.

- 404 if none.


## Inventory

### `GET /api/v1/inventory`
List ingredients. **Access:** Admin.

- Query: `page`, `limit`, `type?: STEM|WRAPPING|RIBBON|PACKAGING|OTHER`, `isActive?`, `lowStock?`, `search?`

### `GET /api/v1/inventory/low-stock`
Low or empty items. **Access:** Admin.


### `POST /api/v1/inventory`
Create. **Access:** Admin.

- Body: `name: 2-80`, `type`, `unit?: stems\|units\|meters\|sheets`, `quantity?: 0-1e7`, `lowStockThreshold?`, `costPerUnit?`, `supplier?`

### `GET /api/v1/inventory/:id`
Get. **Access:** Admin.

- Path: `id` (ObjectId or slug)

### `PATCH /api/v1/inventory/:id`
Update (not quantity). **Access:** Admin.

- Path: `id` (ObjectId or slug)
- Body: `name?, type?, unit?, lowStockThreshold?, costPerUnit?, supplier?, isActive?`

### `PATCH /api/v1/inventory/:id/stock`
Adjust stock. **Access:** Admin.

- Path: `id` (ObjectId or slug)
- Body: `exactly one of: delta (non-zero number) \| quantity (absolute >=0)`
- 409 if a negative delta exceeds stock.

### `DELETE /api/v1/inventory/:id`
Deactivate. **Access:** Admin.

- Path: `id` (ObjectId or slug)


## Admin

Every endpoint requires an admin token.

### `GET /api/v1/admin/stats`
Platform statistics. **Access:** Admin.


### `GET /api/v1/admin/logs`
Audit log. **Access:** Admin.

- Query: `page`, `limit: 1-100 (default 50)`, `adminId?`, `action?`, `targetType?`, `targetId?`, `from?/to?`
- Logs are kept one year.

### `GET /api/v1/admin/profile`
Own admin profile. **Access:** Admin.


### `PATCH /api/v1/admin/profile`
Update own profile. **Access:** Admin.

- Body: `department?, title?, bio?, avatar?, phone?, notifyOnLowStock?, notifyOnNewOrder?, notifyOnNegativeReview?`
- department only changeable by the owner.

### `GET /api/v1/admin/users`
List users. **Access:** Admin.

- Query: `page`, `limit`, `role?: admin|florist|customer`, `isActive?`, `search?`

### `GET /api/v1/admin/users/:id`
User detail. **Access:** Admin.

- Path: `id` (ObjectId or slug)

### `PATCH /api/v1/admin/users/:id`
Update name/phone. **Access:** Admin.

- Path: `id` (ObjectId or slug)
- Body: `name?`, `phone?`

### `PATCH /api/v1/admin/users/:id/role`
Change role (customer or admin). **Access:** Admin.

- Path: `id` (ObjectId or slug)
- Body: `role: customer\|admin`
- 409 for self; 403 for the owner admin; cannot remove the last admin; a florist with active orders cannot be changed. Invalidates the user's tokens.

### `PATCH /api/v1/admin/users/:id/block`
Block user. **Access:** Admin.

- Path: `id` (ObjectId or slug)
- Body: `reason?: <=300`
- Invalidates tokens. Not self, not owner, not last admin.

### `PATCH /api/v1/admin/users/:id/unblock`
Unblock user. **Access:** Admin.

- Path: `id` (ObjectId or slug)
- Body: `reason?`

### `GET /api/v1/admin/florists`
List florists. **Access:** Admin.

- Query: `page`, `limit`, `approvalStatus?: PENDING|APPROVED|REJECTED`, `search?`

### `POST /api/v1/admin/florists`
Create a pre-approved florist. **Access:** Admin.

- Body: `name`, `email`, `password`, `phone`, `businessName?`, `licenseNumber?`, `businessAddress?`, `bio?`, `specialties?`
- 201.

### `GET /api/v1/admin/florists/:id`
Florist (id = user id). **Access:** Admin.

- Path: `id` (ObjectId or slug)

### `PATCH /api/v1/admin/florists/:id/approve`
Approve. **Access:** Admin.

- Path: `id` (ObjectId or slug)
- 409 if already approved.

### `PATCH /api/v1/admin/florists/:id/reject`
Reject. **Access:** Admin.

- Path: `id` (ObjectId or slug)
- Body: `reason: 3-300`

### `PATCH /api/v1/admin/florists/:id/profile`
Edit florist profile. **Access:** Admin.

- Path: `id` (ObjectId or slug)
- Body: `bio?, specialties?, yearsExperience?, shiftStart?, shiftEnd?, isAvailable?`

### `GET /api/v1/admin/support/tickets`
All tickets. **Access:** Admin.

- Query: `page`, `limit`, `status?`, `category?`, `priority?`, `participantId?`, `participantRole?: customer|florist`

### `POST /api/v1/admin/support/tickets`
Open a ticket to a customer or florist. **Access:** Admin.

- Body: `participantId`, `subject`, `message`, `category?`, `priority?: LOW\|NORMAL\|HIGH`, `orderId?`

### `GET /api/v1/admin/support/tickets/:id`
Ticket with all messages. **Access:** Admin.

- Path: `id` (ObjectId or slug)

### `POST /api/v1/admin/support/tickets/:id/messages`
Reply. **Access:** Admin.

- Path: `id` (ObjectId or slug)
- Body: `message: 1-2000`

### `PATCH /api/v1/admin/support/tickets/:id`
Change status/priority. **Access:** Admin.

- Path: `id` (ObjectId or slug)
- Body: `status?`, `priority?`

