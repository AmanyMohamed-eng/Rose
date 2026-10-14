/**
 * Role-specific views of an order. This is where the Admin-mediator rule is enforced for orders:
 *
 *  - customer view : no florist identity, no internal staff ids, no internal recipe.
 *  - florist view  : ONLY what is needed to prepare the arrangement — no customer, no recipient
 *                    name/phone/address, no prices/payment, no order history.
 *  - admin view    : everything.
 */

const toCustomerView = (order) => {
  const o = order.toJSON();
  delete o.assignedFlorist;
  delete o.assignedAt;
  o.statusHistory = (o.statusHistory || []).map((h) => ({ status: h.status, changedAt: h.changedAt }));
  o.items = (o.items || []).map(({ recipe, ...rest }) => rest); // eslint-disable-line no-unused-vars
  return o;
};

const toTrackingView = (order) => ({
  id: order.id,
  orderNumber: order.orderNumber,
  status: order.status,
  deliveryDate: order.delivery?.deliveryDate,
  slot: order.delivery?.slot,
  deliveredAt: order.delivery?.deliveredAt,
  timeline: (order.statusHistory || []).map((h) => ({ status: h.status, changedAt: h.changedAt })),
});

const toFloristView = (order) => ({
  id: order.id,
  orderNumber: order.orderNumber,
  status: order.status,
  deliveryDate: order.delivery?.deliveryDate,
  slot: order.delivery?.slot,
  items: order.items.map((i) => ({
    title: i.title,
    image: i.image,
    size: i.size,
    quantity: i.quantity,
    cardMessage: i.cardMessage,
    wrappingNote: i.wrappingNote,
    recipe: (i.recipe || []).map((r) => ({ name: r.name, unit: r.unit, quantity: r.quantity })),
  })),
});

const toAdminView = (order) => order.toJSON();

module.exports = { toCustomerView, toTrackingView, toFloristView, toAdminView };
