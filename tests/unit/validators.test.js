const { pageQuery, password, objectId, phone } = require('../../src/validators/common');
const { z } = require('zod');
const adminV = require('../../src/modules/admin/admin.validator');
const floristV = require('../../src/modules/florist/florist.validator');
const authV = require('../../src/modules/auth/auth.validator');
const orderV = require('../../src/modules/orders/order.validator');
const couponV = require('../../src/modules/coupons/coupon.validator');

describe('common validators', () => {
  const q = z.object(pageQuery);
  test('page is capped (deep-skip DoS)', () => {
    expect(q.safeParse({ page: '10001' }).success).toBe(false);
    expect(q.safeParse({ page: '10000', limit: '100' }).success).toBe(true);
    expect(q.safeParse({ page: '0' }).success).toBe(false);
    expect(q.safeParse({ limit: '101' }).success).toBe(false);
  });
  test('objectId rejects operators / objects / short strings', () => {
    expect(objectId.safeParse({ $ne: null }).success).toBe(false);
    expect(objectId.safeParse('123').success).toBe(false);
    expect(objectId.safeParse('507f1f77bcf86cd799439011').success).toBe(true);
  });
  test('password policy', () => {
    expect(password.safeParse('short1').success).toBe(false);
    expect(password.safeParse('longenoughbutnodigits').success).toBe(false);
    expect(password.safeParse('a'.repeat(73) + '1').success).toBe(false); // bcrypt truncates at 72 bytes
    expect(password.safeParse('goodpass123').success).toBe(true);
  });
  test('phone', () => {
    expect(phone.safeParse('+201001234567').success).toBe(true);
    expect(phone.safeParse('12ab').success).toBe(false);
  });
});

describe('mass assignment is stripped by validators', () => {
  test('register ignores role / isActive / tokenVersion', () => {
    const r = authV.register.parse({ name: 'Ann Lee', email: 'A@B.com', password: 'goodpass123', role: 'admin', isActive: false, tokenVersion: 9 });
    expect(r).toEqual({ name: 'Ann Lee', email: 'a@b.com', password: 'goodpass123' });
  });
  test('updateMe ignores role/email/password', () => {
    const r = authV.updateMe.parse({ name: 'New Name', role: 'admin', email: 'x@y.com', password: 'zzzzzzz1' });
    expect(r).toEqual({ name: 'New Name' });
  });
  test('admin role endpoint only allows customer/admin (florists go through approval)', () => {
    expect(adminV.updateRole.safeParse({ role: 'florist' }).success).toBe(false);
    expect(adminV.updateRole.safeParse({ role: 'superadmin' }).success).toBe(false);
  });
  test('admin updateUser cannot touch role/isActive/email', () => {
    expect(adminV.updateUser.parse({ name: 'Okay Name', role: 'admin', isActive: true, email: 'x@y.com' })).toEqual({ name: 'Okay Name' });
  });
  test('order payload cannot inject price/total/status', () => {
    const r = orderV.createOrder.parse({
      items: [{ productId: '507f1f77bcf86cd799439011', quantity: 1, unitPrice: 0.01, price: 0 }],
      delivery: { recipientName: 'Bob', recipientPhone: '+201001234567', addressLine1: '1 Street', city: 'Cairo', deliveryDate: new Date(Date.now() + 864e5).toISOString(), slot: '09:00-12:00' },
      paymentMethod: 'COD', total: 1, status: 'DELIVERED', paymentStatus: 'PAID',
    });
    expect(r).not.toHaveProperty('total');
    expect(r).not.toHaveProperty('status');
    expect(r).not.toHaveProperty('paymentStatus');
    expect(r.items[0]).not.toHaveProperty('unitPrice');
    expect(r.items[0]).not.toHaveProperty('price');
  });
  test('order quantity bounds and type', () => {
    const base = { productId: '507f1f77bcf86cd799439011' };
    const parse = (quantity) => orderV.createOrder.shape.items.element.safeParse({ ...base, quantity }).success;
    expect(parse(0)).toBe(false);
    expect(parse(-1)).toBe(false);
    expect(parse(1.5)).toBe(false);
    expect(parse('2')).toBe(false);
    expect(parse(51)).toBe(false);
    expect(parse(50)).toBe(true);
  });
  test('order status endpoint cannot set PLACED; florist limited to PREPARING/READY', () => {
    expect(orderV.updateStatus.safeParse({ status: 'PLACED' }).success).toBe(false);
    expect(orderV.prepStatus.safeParse({ status: 'DELIVERED' }).success).toBe(false);
    expect(orderV.prepStatus.safeParse({ status: 'READY' }).success).toBe(true);
  });
  test('admin may only mark an order PAID or FAILED manually', () => {
    expect(orderV.payment.safeParse({ paymentStatus: 'REFUNDED' }).success).toBe(false);
  });
  test('coupon percentage cannot exceed 100 and expiry must follow start', () => {
    const base = { code: 'save10', discountType: 'PERCENTAGE', discountValue: 150, expiryDate: new Date(Date.now() + 1e9).toISOString() };
    expect(couponV.create.safeParse(base).success).toBe(false);
    expect(couponV.create.safeParse({ ...base, discountValue: 10, startDate: new Date(Date.now() + 2e9).toISOString() }).success).toBe(false);
    expect(couponV.create.safeParse({ ...base, discountValue: 10 }).success).toBe(true);
  });
});

describe('shift time validation (regression: 99:99 was accepted)', () => {
  test.each([['09:00', true], ['23:59', true], ['24:00', false], ['99:99', false], ['12:60', false], ['9:00', false]])('%s -> %s', (t, ok) => {
    expect(adminV.updateFloristProfile.safeParse({ shiftStart: t }).success).toBe(ok);
    expect(floristV.updateProfile.safeParse({ shiftStart: t }).success).toBe(ok);
  });
});
