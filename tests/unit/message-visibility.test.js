const mongoose = require('mongoose');
const Message = require('../../src/models/Message');
const ChatbotSession = require('../../src/models/ChatbotSession');

const oid = () => new mongoose.Types.ObjectId();

describe('Message.toView – admin-mediator isolation (regression: readBy leaked reader user ids)', () => {
  const customerId = oid();
  const floristId = oid();
  const adminId = oid();

  const relayed = () =>
    new Message({
      conversation: oid(),
      author: adminId,
      authorSide: 'ADMIN',
      body: 'Relayed by admin to both sides',
      visibleTo: ['ADMIN', 'CUSTOMER', 'FLORIST'],
      readBy: [
        { user: customerId, side: 'CUSTOMER', readAt: new Date() },
        { user: floristId, side: 'FLORIST', readAt: new Date() },
      ],
    });

  test('customer view contains no user ids and no florist receipt', () => {
    const view = relayed().toView('CUSTOMER');
    expect(view.readBy).toHaveLength(1);
    expect(view.readBy[0].side).toBe('CUSTOMER');
    expect(JSON.stringify(view)).not.toContain(String(floristId));
    expect(JSON.stringify(view)).not.toContain(String(customerId));
  });

  test('florist view contains no customer receipt or ids', () => {
    const view = relayed().toView('FLORIST');
    expect(view.readBy.map((r) => r.side)).toEqual(['FLORIST']);
    expect(JSON.stringify(view)).not.toContain(String(customerId));
  });

  test('admin view keeps full receipts and mediation metadata', () => {
    const view = relayed().toView('ADMIN');
    expect(view.readBy).toHaveLength(2);
    expect(view).toHaveProperty('originalBody');
    expect(view).toHaveProperty('relayedBy');
  });

  test('non-admin views never expose relay/deletion metadata', () => {
    for (const side of ['CUSTOMER', 'FLORIST']) {
      const view = relayed().toView(side);
      for (const k of ['relayedBy', 'relayedFrom', 'originalBody', 'deletedBy', 'deletedAt', 'authorId']) {
        expect(view).not.toHaveProperty(k);
      }
    }
  });

  test('internal notes are always admin-only', async () => {
    const m = new Message({ conversation: oid(), author: adminId, authorSide: 'ADMIN', body: 'note', isInternalNote: true, visibleTo: ['CUSTOMER'] });
    await m.validate();
    expect(m.visibleTo).toEqual(['ADMIN']);
    expect(m.isVisibleTo('CUSTOMER')).toBe(false);
  });

  test('visibleTo always contains ADMIN', async () => {
    const m = new Message({ conversation: oid(), author: customerId, authorSide: 'CUSTOMER', body: 'hi', visibleTo: ['CUSTOMER'] });
    await m.validate();
    expect(m.visibleTo).toContain('ADMIN');
  });
});

describe('ChatbotSession transcript bound (regression: unbounded embedded array)', () => {
  test('trimMessages keeps only the newest MAX_MESSAGES', () => {
    const max = ChatbotSession.MAX_MESSAGES;
    const s = new ChatbotSession({ customer: oid() });
    for (let i = 0; i < max + 25; i += 1) s.messages.push({ sender: 'USER', body: `m${i}` });
    s.trimMessages();
    expect(s.messages).toHaveLength(max);
    expect(s.messages[0].body).toBe('m25');
    expect(s.messages[max - 1].body).toBe(`m${max + 24}`);
  });

  test('trimMessages is a no-op below the limit', () => {
    const s = new ChatbotSession({ customer: oid() });
    s.messages.push({ sender: 'USER', body: 'a' });
    s.trimMessages();
    expect(s.messages).toHaveLength(1);
  });
});
