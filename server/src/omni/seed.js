export function createOmniSeed() {
  const pages = [
    { id: 'page_mankynd', name: 'MAN KYND', status: 'active', brandGroupId: 'brand_mankynd', policySetId: 'policy_mankynd', agentProfileId: 'agent_mankynd' },
    { id: 'page_annalynn', name: 'Anna Lynn', status: 'active', brandGroupId: 'brand_fashion', policySetId: 'policy_annalynn', agentProfileId: 'agent_annalynn' },
    { id: 'page_des', name: 'เพจเดส', status: 'active', brandGroupId: 'brand_oagent', policySetId: 'policy_page_des', agentProfileId: 'agent_page_des' },
    { id: 'page_fb_112154661515664', name: 'Facebook Page 112154661515664', status: 'active', brandGroupId: 'brand_shared', policySetId: 'policy_default', agentProfileId: 'agent_default' },
    { id: 'page_shop_4', name: 'Seed Page 4', status: 'active', brandGroupId: 'brand_shared', policySetId: 'policy_default', agentProfileId: 'agent_default' },
    { id: 'page_shop_5', name: 'Seed Page 5', status: 'active', brandGroupId: 'brand_shared', policySetId: 'policy_default', agentProfileId: 'agent_default' },
  ]

  return {
    pages,
    platformAccounts: [
      { id: 'acct_fb_mankynd', pageId: 'page_mankynd', platform: 'facebook', provider: 'meta', status: 'healthy' },
      { id: 'acct_fb_112154661515664', pageId: 'page_fb_112154661515664', platform: 'facebook', provider: 'meta', status: 'pending_token' },
      { id: 'acct_tt_shop', pageId: 'page_annalynn', platform: 'tiktok', provider: 'tiktok_shop', status: 'healthy' },
    ],
    policySets: [
      { id: 'policy_default', autoSend: { faq: true, stock: true, price: false, orderStatus: false }, forbidden: ['refund', 'cancel', 'คืนเงิน', 'ยกเลิก'] },
      { id: 'policy_mankynd', autoSend: { faq: true, stock: true, price: true, orderStatus: false }, forbidden: ['refund', 'cancel', 'คืนเงิน', 'ยกเลิก'] },
      { id: 'policy_annalynn', autoSend: { faq: true, stock: true, price: true, orderStatus: false }, forbidden: ['refund', 'cancel', 'คืนเงิน', 'ยกเลิก'] },
      { id: 'policy_page_des', autoSend: { faq: false, stock: false, price: false, orderStatus: false }, forbidden: ['publish', 'live', 'โพสต์เลย'] },
    ],
    agentProfiles: [
      { id: 'agent_default', name: 'Default Sales AI', provider: 'openai', model: 'configurable', role: 'page_primary' },
      { id: 'agent_mankynd', name: 'MAN KYND Page AI', provider: 'openai', model: 'configurable', role: 'page_primary' },
      { id: 'agent_annalynn', name: 'Anna Lynn Page AI', provider: 'openai', model: 'configurable', role: 'page_primary' },
      { id: 'agent_page_des', name: 'Page Des AI', provider: 'openai', model: 'configurable', role: 'page_primary' },
      { id: 'agent_stock', name: 'Stock Specialist', provider: 'openai', model: 'configurable', role: 'stock_specialist' },
      { id: 'agent_reviewer', name: 'Risk Reviewer', provider: 'openai', model: 'configurable', role: 'reviewer' },
    ],
    threads: [
      { id: 'thread_1', pageId: 'page_mankynd', platform: 'facebook', customerId: 'cust_1', status: 'draft_ready', intent: 'stock', risk: 'low', updatedAt: '2026-05-22T10:00:00.000Z' },
      { id: 'thread_2', pageId: 'page_annalynn', platform: 'tiktok', customerId: 'cust_2', status: 'needs_approval', intent: 'orderStatus', risk: 'medium', updatedAt: '2026-05-22T10:05:00.000Z' },
    ],
    messages: [
      { id: 'msg_1', threadId: 'thread_1', direction: 'inbound', authorName: 'ลูกค้า A', text: 'มีไซซ์ M สีดำไหม', createdAt: '2026-05-22T10:00:00.000Z', providerMessageId: 'fb_mid_1' },
      { id: 'msg_2', threadId: 'thread_2', direction: 'inbound', authorName: 'ลูกค้า B', text: 'ขอเลขพัสดุค่ะ', createdAt: '2026-05-22T10:05:00.000Z', providerMessageId: 'tt_mid_1' },
    ],
    customers: [
      { id: 'cust_1', displayName: 'ลูกค้า A', matchConfidence: 0.98 },
      { id: 'cust_2', displayName: 'ลูกค้า B', matchConfidence: 0.62 },
    ],
    orders: [
      { id: 'order_1', customerId: 'cust_2', platform: 'tiktok', status: 'awaiting_shipment', total: 729, tracking: null },
    ],
    inventorySnapshots: [
      { id: 'stock_1', sku: 'BLACK-M', source: 'bigseller_mock', available: 4, checkedAt: '2026-05-22T10:00:00.000Z' },
    ],
    aiDecisions: [
      { id: 'decision_1', threadId: 'thread_1', agentProfileId: 'agent_stock', confidence: 0.94, action: 'draft_ready', sourceIds: ['stock_1'] },
      { id: 'decision_2', threadId: 'thread_2', agentProfileId: 'agent_reviewer', confidence: 0.61, action: 'needs_approval', sourceIds: ['order_1'] },
    ],
    paymentRequests: [
      { id: 'pay_1', threadId: 'thread_2', orderId: 'order_1', provider: 'promptpay', status: 'draft', amount: 729, currency: 'THB', approvalRequired: true },
      { id: 'pay_2', threadId: 'thread_1', orderId: null, provider: 'meta_pay_kgp', status: 'draft', amount: 0, currency: 'THB', approvalRequired: true },
    ],
    paymentEvents: [
      { id: 'pay_event_1', paymentRequestId: 'pay_1', type: 'created', source: 'mock', createdAt: '2026-05-22T10:06:00.000Z' },
    ],
    connectorHealth: [
      { id: 'health_meta', provider: 'meta', status: 'healthy', lastCheckedAt: '2026-05-22T10:00:00.000Z' },
      { id: 'health_tiktok', provider: 'tiktok_shop', status: 'healthy', lastCheckedAt: '2026-05-22T10:00:00.000Z' },
      { id: 'health_bigseller', provider: 'bigseller', status: 'disabled', lastCheckedAt: null },
      { id: 'health_shopee', provider: 'shopee', status: 'disabled', lastCheckedAt: null },
      { id: 'health_meta_pay_kgp', provider: 'meta_pay_kgp', status: 'disabled', lastCheckedAt: null },
      { id: 'health_promptpay', provider: 'promptpay', status: 'disabled', lastCheckedAt: null },
    ],
  }
}
