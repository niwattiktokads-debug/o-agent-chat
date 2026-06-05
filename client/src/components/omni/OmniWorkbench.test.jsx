import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import OmniWorkbench from './OmniWorkbench.jsx'
import { searchEasyStoreProducts } from '../../lib/omniApi.js'

const omniMock = vi.hoisted(() => ({
  subscribers: [],
}))

vi.mock('../../lib/omniApi.js', () => ({
  fetchOmniSnapshot: async () => ({
    pages: [
      { id: 'page_mankynd', name: 'MAN KYND', status: 'active' },
      { id: 'page_annalynn_tiktok', name: 'AnnaLynn', status: 'active' },
      { id: 'page_fb_112154661515664', name: 'Viris Zamara', status: 'active' },
    ],
    platformAccounts: [
      { id: 'acct_fb_mankynd', pageId: 'page_mankynd', platform: 'facebook' },
      { id: 'acct_tt_shop', pageId: 'page_annalynn_tiktok', platform: 'tiktok' },
      { id: 'acct_fb_vz', pageId: 'page_fb_112154661515664', platform: 'facebook' },
    ],
    threads: [{ id: 'thread_1', customerId: 'cust_1', pageId: 'page_mankynd', platform: 'facebook', status: 'draft_ready', intent: 'stock', risk: 'low' }],
    messages: [{ id: 'msg_1', threadId: 'thread_1', direction: 'inbound', authorName: 'ลูกค้า A', text: 'มีไซซ์ M สีดำไหม' }],
    customers: [
      { id: 'cust_1', displayName: 'ลูกค้า A', providerCustomerId: 'fb_customer_a' },
      { id: 'cust_other', displayName: 'ลูกค้า B', providerCustomerId: 'fb_customer_b' },
    ],
    orders: [{ id: 'tt_order_1', customerId: 'tt_customer_1', platform: 'tiktok', providerOrderId: '1', status: 'AWAITING_COLLECTION', total: 841.5, currency: 'THB' }],
    aiDecisions: [{ id: 'decision_1', threadId: 'thread_1', confidence: 0.94, action: 'draft_ready' }],
    paymentRequests: [{ id: 'pay_1', threadId: 'thread_1', provider: 'promptpay', status: 'draft', amount: 729, currency: 'THB', approvalRequired: true }],
    connectorHealth: [{ id: 'health_meta', provider: 'meta', status: 'healthy' }],
  }),
  subscribeOmniSnapshots: (callback) => {
    omniMock.subscribers.push(callback)
    return () => {
      omniMock.subscribers = omniMock.subscribers.filter((item) => item !== callback)
    }
  },
  fetchConnectorHealth: async () => [{ provider: 'meta', status: 'healthy' }],
  fetchPaymentProviderHealth: async () => ({
    provider: 'meta_pay_kgp',
    status: 'disabled',
    mode: 'credentials_pending',
    liveReady: false,
    credentialsReady: false,
  }),
  createPaymentRequest: async (input) => ({
    ok: true,
    payment: {
      id: 'pay_kgp_new',
      threadId: input.threadId,
      provider: 'meta_pay_kgp',
      status: 'draft',
      amount: input.amount,
      currency: input.currency || 'THB',
      approvalRequired: true,
      messagePreview: 'สรุปยอดชำระค่ะ\nยอดชำระ: THB 729\nลิงก์ Meta Pay / KGP จะถูกสร้างหลังระบบชำระเงินพร้อมใช้งาน',
    },
    snapshot: {
      pages: [{ id: 'page_mankynd', name: 'MAN KYND', status: 'active' }],
      platformAccounts: [{ id: 'acct_fb_mankynd', pageId: 'page_mankynd', platform: 'facebook' }],
      threads: [{ id: 'thread_1', customerId: 'cust_1', pageId: 'page_mankynd', platform: 'facebook', status: 'draft_ready', intent: 'stock', risk: 'low' }],
      messages: [{ id: 'msg_1', threadId: 'thread_1', direction: 'inbound', authorName: 'ลูกค้า A', text: 'มีไซซ์ M สีดำไหม' }],
      customers: [{ id: 'cust_1', displayName: 'ลูกค้า A' }],
      orders: [],
      aiDecisions: [],
      paymentRequests: [{
        id: 'pay_kgp_new',
        threadId: input.threadId,
        provider: 'meta_pay_kgp',
        status: 'draft',
        amount: input.amount,
        currency: input.currency || 'THB',
        approvalRequired: true,
        messagePreview: 'สรุปยอดชำระค่ะ\nยอดชำระ: THB 729\nลิงก์ Meta Pay / KGP จะถูกสร้างหลังระบบชำระเงินพร้อมใช้งาน',
      }],
      connectorHealth: [],
    },
  }),
  createKgpCheckout: async () => ({ ok: false, error: 'kgp_provider_not_enabled' }),
  fetchConnections: async () => ({
    ok: true,
    connections: [
      { id: 'meta_man_kynd', title: 'Meta · MAN KYND', provider: 'meta', pageProfile: 'man_kynd' },
      { id: 'meta_anna_lynn', title: 'Meta · Anna Lynn', provider: 'meta', pageProfile: 'anna_lynn' },
    ],
  }),
  fetchFacebookConversations: async () => ({ threads: [] }),
  syncFacebookConversations: async () => ({
    page: { omniPageId: 'page_mankynd' },
    threads: { inserted: 0, updated: 0 },
    snapshot: {
      pages: [{ id: 'page_mankynd', name: 'MAN KYND', status: 'active' }],
      threads: [],
      messages: [],
      customers: [],
      orders: [],
      aiDecisions: [],
      paymentRequests: [],
      connectorHealth: [],
    },
  }),
  fetchTikTokOrders: async () => ({ totalCount: 0, orders: [] }),
  syncTikTokOrders: async () => ({
    totalCount: 0,
    snapshot: {
      pages: [{ id: 'page_mankynd', name: 'MAN KYND', status: 'active' }],
      threads: [],
      messages: [],
      customers: [],
      orders: [],
      aiDecisions: [],
      paymentRequests: [],
      connectorHealth: [],
    },
  }),
  createAiDraft: async () => ({
    decision: { id: 'decision_ai_new', threadId: 'thread_1', action: 'draft_ready', confidence: 0.82, draftText: 'เดี๋ยวเช็กสต็อกให้ค่ะ' },
    snapshot: {
      pages: [{ id: 'page_mankynd', name: 'MAN KYND', status: 'active' }],
      platformAccounts: [{ id: 'acct_fb_mankynd', pageId: 'page_mankynd', platform: 'facebook' }],
      threads: [{ id: 'thread_1', customerId: 'cust_1', pageId: 'page_mankynd', platform: 'facebook', status: 'draft_ready', intent: 'stock', risk: 'low' }],
      messages: [{ id: 'msg_1', threadId: 'thread_1', direction: 'inbound', authorName: 'ลูกค้า A', text: 'มีไซซ์ M สีดำไหม' }],
      customers: [{ id: 'cust_1', displayName: 'ลูกค้า A' }],
      orders: [],
      aiDecisions: [{ id: 'decision_ai_new', threadId: 'thread_1', action: 'draft_ready', confidence: 0.82, draftText: 'เดี๋ยวเช็กสต็อกให้ค่ะ' }],
      paymentRequests: [],
      connectorHealth: [],
    },
  }),
  fetchSalesContext: async () => ({
    ok: true,
    thread: { id: 'thread_1', customerId: 'cust_1', pageId: 'page_mankynd', platform: 'facebook', status: 'draft_ready' },
    customer: {
      match: { safeToUsePrivateData: true, confidence: 0.98, basis: ['same_customer_id'], linkedOrderCount: 1 },
      memory: {
        phoneMasked: '081***5678',
        phoneLast4: '5678',
        lastOrderNumber: 'AL-1001',
        lastSku: 'BLACK-M',
        lastSize: 'M',
        lastColor: 'ดำ',
        lastAddressMasked: '99/x สุข... คลองตัน กรุงเทพมหานคร 10110',
      },
    },
    product: {
      confidence: 0.9,
      product: { productId: '16462402', productName: 'เสื้อเชิ้ตโปโลผู้หญิง สีดำ', price: 590, availableTotal: 20 },
      variants: [{ id: 'stock_black_m', sku: 'BLACK-M', available: 20, price: 590 }],
      sourceIds: ['stock_black_m'],
    },
    imagePicker: {
      ok: true,
      source: 'easystore_preview',
      productId: '16462402',
      images: [{ id: 'img_black_m', url: 'https://cdn.example/black-m.jpg', alt: 'เสื้อเชิ้ตโปโลผู้หญิง สีดำ M' }],
    },
  }),
  saveManualReplyDraft: async (threadId, draft) => ({
    ok: true,
    message: {
      id: 'draft_1',
      threadId,
      direction: 'outbound',
      authorName: draft.authorName,
      text: draft.text,
      attachments: draft.attachments || [],
      sourceRef: 'manual_draft',
      createdAt: '2026-05-24T00:00:00.000Z',
      deliveryStatus: 'draft_only',
    },
    snapshot: {
      pages: [{ id: 'page_mankynd', name: 'MAN KYND', status: 'active' }],
      platformAccounts: [{ id: 'acct_fb_mankynd', pageId: 'page_mankynd', platform: 'facebook' }],
      threads: [{ id: 'thread_1', customerId: 'cust_1', pageId: 'page_mankynd', platform: 'facebook', status: 'draft_ready', intent: 'stock', risk: 'low' }],
      messages: [
        { id: 'msg_1', threadId: 'thread_1', direction: 'inbound', authorName: 'ลูกค้า A', text: 'มีไซซ์ M สีดำไหม' },
        { id: 'draft_1', threadId: 'thread_1', direction: 'outbound', authorName: draft.authorName, text: draft.text, sourceRef: 'manual_draft', createdAt: '2026-05-24T00:00:00.000Z' },
      ],
      customers: [{ id: 'cust_1', displayName: 'ลูกค้า A' }],
      orders: [],
      aiDecisions: [],
      paymentRequests: [],
      connectorHealth: [],
    },
  }),
  sendManualReply: async (threadId, draft) => ({
    ok: true,
    sent: true,
    message: {
      id: 'sent_1',
      threadId,
      direction: 'outbound',
      authorName: draft.authorName,
      text: draft.text,
      attachments: draft.attachments || [],
      sourceRef: 'manual_send:man_kynd',
      createdAt: '2026-05-24T00:01:00.000Z',
    },
    snapshot: {
      pages: [{ id: 'page_mankynd', name: 'MAN KYND', status: 'active' }],
      platformAccounts: [{ id: 'acct_fb_mankynd', pageId: 'page_mankynd', platform: 'facebook' }],
      threads: [{ id: 'thread_1', customerId: 'cust_1', pageId: 'page_mankynd', platform: 'facebook', status: 'auto_sent', intent: 'stock', risk: 'low' }],
      messages: [
        { id: 'msg_1', threadId: 'thread_1', direction: 'inbound', authorName: 'ลูกค้า A', text: 'มีไซซ์ M สีดำไหม' },
        { id: 'sent_1', threadId: 'thread_1', direction: 'outbound', authorName: draft.authorName, text: draft.text, attachments: draft.attachments || [], sourceRef: 'manual_send:man_kynd', createdAt: '2026-05-24T00:01:00.000Z' },
      ],
      customers: [{ id: 'cust_1', displayName: 'ลูกค้า A' }],
      orders: [],
      aiDecisions: [],
      paymentRequests: [],
      connectorHealth: [],
    },
  }),
  createEasyStoreProductDraft: async (threadId, productId) => ({
    ok: true,
    product: { id: productId, title: 'Amanda Jumpsuit' },
    message: {
      id: 'draft_product_1',
      threadId,
      direction: 'outbound',
      authorName: 'บอส',
      text: 'แนะนำตัวนี้ค่ะ: Amanda Jumpsuit\nดูสินค้า: https://omni.oagent.biz/p/easystore/16462646?threadId=thread_1',
      attachments: [{ id: 'att_product_1', name: 'Amanda Jumpsuit', type: 'image/jpeg', url: 'https://cdn.example/amanda.jpg' }],
      sourceRef: `easystore_product_draft:${productId}`,
      createdAt: '2026-06-04T00:00:00.000Z',
      deliveryStatus: 'draft_only',
    },
    snapshot: {
      pages: [{ id: 'page_mankynd', name: 'MAN KYND', status: 'active' }],
      platformAccounts: [{ id: 'acct_fb_mankynd', pageId: 'page_mankynd', platform: 'facebook' }],
      threads: [{ id: 'thread_1', customerId: 'cust_1', pageId: 'page_mankynd', platform: 'facebook', status: 'draft_ready', intent: 'stock', risk: 'low' }],
      messages: [
        { id: 'msg_1', threadId: 'thread_1', direction: 'inbound', authorName: 'ลูกค้า A', text: 'มีไซซ์ M สีดำไหม' },
        {
          id: 'draft_product_1',
          threadId: 'thread_1',
          direction: 'outbound',
          authorName: 'บอส',
          text: 'แนะนำตัวนี้ค่ะ: Amanda Jumpsuit\nดูสินค้า: https://omni.oagent.biz/p/easystore/16462646?threadId=thread_1',
          attachments: [{ id: 'att_product_1', name: 'Amanda Jumpsuit', type: 'image/jpeg', url: 'https://cdn.example/amanda.jpg' }],
          sourceRef: `easystore_product_draft:${productId}`,
          createdAt: '2026-06-04T00:00:00.000Z',
          deliveryStatus: 'draft_only',
        },
      ],
      customers: [{ id: 'cust_1', displayName: 'ลูกค้า A' }],
      orders: [],
      aiDecisions: [],
      paymentRequests: [],
      connectorHealth: [],
    },
  }),
  fetchEasyStoreProductPreview: async () => ({
    ok: true,
    product: {
      id: '16462646',
      title: 'Amanda Jumpsuit',
      price: { formatted: '฿1,290' },
      stock: { totalQuantity: 3, status: 'in_stock' },
      images: [{ id: 'img_amanda', alt: 'Amanda Jumpsuit', url: 'https://cdn.example/amanda.jpg' }],
      links: { storefrontUrl: 'https://annalynna.easy.co/products/amanda-jumpsuit' },
    },
  }),
  setPageAutoReply: async (pageId, enabled) => ({
    ok: true,
    snapshot: {
      pages: [{ id: pageId, name: 'MAN KYND', status: 'active', autoReplyEnabled: enabled }],
      platformAccounts: [{ id: 'acct_fb_mankynd', pageId, platform: 'facebook' }],
      threads: [{ id: 'thread_1', customerId: 'cust_1', pageId, platform: 'facebook', status: 'draft_ready', intent: 'stock', risk: 'low' }],
      messages: [{ id: 'msg_1', threadId: 'thread_1', direction: 'inbound', authorName: 'ลูกค้า A', text: 'มีไซซ์ M สีดำไหม' }],
      customers: [{ id: 'cust_1', displayName: 'ลูกค้า A' }],
      orders: [],
      aiDecisions: [],
      paymentRequests: [],
      connectorHealth: [],
    },
  }),
  fetchSocialPosts: async () => ({
    ok: true,
    posts: [{ id: 'post_1', message: 'เปิดขาย BLACK-M', commentCount: 1, createdTime: '2026-05-26T00:00:00.000Z' }],
  }),
  capturePostSession: async () => ({
    ok: true,
    summary: { parsedCount: 1, draftCount: 1 },
    drafts: [{ id: 'order_draft_1', status: 'draft', items: [{ sku: 'BLACK-M', quantity: 2 }] }],
    snapshot: {
      pages: [{ id: 'page_mankynd', name: 'MAN KYND', status: 'active' }],
      platformAccounts: [{ id: 'acct_fb_mankynd', pageId: 'page_mankynd', platform: 'facebook' }],
      threads: [{ id: 'thread_1', customerId: 'cust_1', pageId: 'page_mankynd', platform: 'facebook', status: 'draft_ready', intent: 'stock', risk: 'low' }],
      messages: [{ id: 'msg_1', threadId: 'thread_1', direction: 'inbound', authorName: 'ลูกค้า A', text: 'มีไซซ์ M สีดำไหม' }],
      customers: [{ id: 'cust_1', displayName: 'ลูกค้า A' }],
      orders: [{ id: 'order_draft_1', customerId: 'cust_1', platform: 'facebook', status: 'draft', totalAmount: 1180, items: [{ sku: 'BLACK-M', quantity: 2 }] }],
      aiDecisions: [],
      paymentRequests: [],
      connectorHealth: [],
    },
  }),
  fetchLiveSources: async () => ({
    ok: true,
    mode: 'fallback_live_post_comment_capture',
    blocker: 'meta_live_comment_stream_not_available_in_current_helper',
    posts: [{ id: 'live_fallback_1', message: 'Live fallback post', commentCount: 3 }],
  }),
  fetchMessageVolumeReport: async () => ({
    totals: { inbound: 2, outbound: 1, total: 3 },
    byHour: [{ hour: '10', inbound: 2, outbound: 1, total: 3 }],
    byPage: [{ pageId: 'page_mankynd', inbound: 2, outbound: 1, total: 3 }],
  }),
  fetchOmniSettings: async () => ({
    postSession: { enabled: true, autoCreateDrafts: true },
    postCf: { enabled: true, autoCreateDrafts: true },
    liveCf: { enabled: true, mode: 'fallback_post_comment_capture' },
    report: { timezone: 'Asia/Bangkok' },
    orderDraft: { enabled: true, approvalRequired: true, createZortOrderOnApprove: true },
    orderAddressIntake: { enabled: true, createConfirmationDraft: true },
    ai: { enabled: true, customerSendEnabled: false, salesAssets: { enabled: true, sizeChartImageUrl: '' } },
  }),
  saveOmniSettings: async (settings) => ({
    ok: true,
    settings,
  }),
  searchZortProducts: async () => ({
    ok: true,
    products: [{ id: '637', sku: 'BLACK-M', name: 'Black Shirt M', sellPrice: 590, availableStock: 7 }],
  }),
  searchEasyStoreProducts: vi.fn(async () => ({
    ok: true,
    products: [{
      id: '76013285',
      productId: '16462394',
      variantId: '76013285',
      sku: 'lorสีดำXL',
      name: 'Lorra สีดำ XL',
      productName: 'Lorra เดรสเชิ้ต Polo',
      variantTitle: 'ดำ / XL',
      color: 'ดำ',
      size: 'XL',
      imageUrl: 'https://cdn.example/lorra.jpg',
      sellPrice: 690,
      availableStock: 13,
    }],
  })),
  lookupThaiAddressByPostcode: async () => ({
    ok: true,
    postalCode: '10110',
    count: 1,
    suggestions: [{
      key: '10110|กรุงเทพมหานคร|คลองเตย|คลองตัน',
      postalCode: '10110',
      province: 'กรุงเทพมหานคร',
      district: 'คลองเตย',
      subDistrict: 'คลองตัน',
    }],
    source: { package: 'thai-address-universal', provinceCount: 77 },
  }),
  extractOrderAddressFromThread: async () => ({
    ok: true,
    extracted: {
      recipientName: 'ลูกค้า A',
      recipientPhone: '0812345678',
      addressLine: '99/1 ถนนสุขุมวิท',
      postalCode: '10110',
      selectedAddressKey: '10110|กรุงเทพมหานคร|คลองเตย|คลองตัน',
      selectedAddress: {
        key: '10110|กรุงเทพมหานคร|คลองเตย|คลองตัน',
        postalCode: '10110',
        province: 'กรุงเทพมหานคร',
        district: 'คลองเตย',
        subDistrict: 'คลองตัน',
      },
      formattedAddress: '99/1 ถนนสุขุมวิท แขวงคลองตัน เขตคลองเตย กรุงเทพมหานคร 10110',
      readyForDraft: true,
      confidence: 0.95,
      missingFields: [],
    },
    addressLookup: {
      ok: true,
      suggestions: [{
        key: '10110|กรุงเทพมหานคร|คลองเตย|คลองตัน',
        postalCode: '10110',
        province: 'กรุงเทพมหานคร',
        district: 'คลองเตย',
        subDistrict: 'คลองตัน',
      }],
      source: { package: 'thai-address-universal', provinceCount: 77 },
    },
    confirmationText: 'รบกวนตรวจสอบที่อยู่จัดส่งนี้ให้หน่อยค่ะ\nชื่อผู้รับ: ลูกค้า A\nโทร: 0812345678\nที่อยู่: 99/1 ถนนสุขุมวิท แขวงคลองตัน เขตคลองเตย กรุงเทพมหานคร 10110',
    confirmationDraft: {
      message: {
        id: 'draft_address_confirm',
        text: 'รบกวนตรวจสอบที่อยู่จัดส่งนี้ให้หน่อยค่ะ\nชื่อผู้รับ: ลูกค้า A\nโทร: 0812345678\nที่อยู่: 99/1 ถนนสุขุมวิท แขวงคลองตัน เขตคลองเตย กรุงเทพมหานคร 10110',
      },
    },
    snapshot: {
      pages: [{ id: 'page_mankynd', name: 'MAN KYND', status: 'active' }],
      platformAccounts: [{ id: 'acct_fb_mankynd', pageId: 'page_mankynd', platform: 'facebook' }],
      threads: [{ id: 'thread_1', customerId: 'cust_1', pageId: 'page_mankynd', platform: 'facebook', status: 'draft_ready', intent: 'stock', risk: 'low' }],
      messages: [
        { id: 'msg_1', threadId: 'thread_1', direction: 'inbound', authorName: 'ลูกค้า A', text: 'มีไซซ์ M สีดำไหม' },
        { id: 'draft_address_confirm', threadId: 'thread_1', direction: 'outbound', authorName: 'AI', text: 'รบกวนตรวจสอบที่อยู่จัดส่งนี้ให้หน่อยค่ะ', sourceRef: 'ai_address_confirmation_draft' },
      ],
      customers: [{ id: 'cust_1', displayName: 'ลูกค้า A' }],
      orders: [],
      aiDecisions: [],
      paymentRequests: [],
      connectorHealth: [],
    },
  }),
  createOrderDraft: async (input) => ({
    ok: true,
    order: {
      id: 'order_draft_1',
      status: 'draft',
      totalAmount: (input.items || []).reduce((sum, item) => sum + Number(item.unitPrice || 0) * Number(item.quantity || 1), 0),
      items: input.items || [{ sku: 'BLACK-M', quantity: 1 }],
      shippingMethod: input.shippingMethod,
      paymentMethod: input.paymentMethod,
      shippingAddress: {
        ...input.shippingAddress,
        formattedAddress: `${input.shippingAddress.addressLine} แขวง${input.shippingAddress.subDistrict} เขต${input.shippingAddress.district} ${input.shippingAddress.province} ${input.shippingAddress.postalCode}`,
      },
    },
    snapshot: {
      pages: [{ id: 'page_mankynd', name: 'MAN KYND', status: 'active' }],
      platformAccounts: [{ id: 'acct_fb_mankynd', pageId: 'page_mankynd', platform: 'facebook' }],
      threads: [{ id: 'thread_1', customerId: 'cust_1', pageId: 'page_mankynd', platform: 'facebook', status: 'draft_ready', intent: 'stock', risk: 'low' }],
      messages: [{ id: 'msg_1', threadId: 'thread_1', direction: 'inbound', authorName: 'ลูกค้า A', text: 'มีไซซ์ M สีดำไหม' }],
      customers: [{ id: 'cust_1', displayName: 'ลูกค้า A' }],
      orders: [{ id: 'order_draft_1', customerId: 'cust_1', platform: 'omni', status: 'draft', totalAmount: 590, items: input.items || [{ sku: 'BLACK-M', quantity: 1 }] }],
      aiDecisions: [],
      paymentRequests: [],
      connectorHealth: [],
    },
  }),
  approveOrderDraft: async (_orderId, options = {}) => ({
    ok: true,
    order: {
      id: 'order_draft_1',
      status: options.provider === 'easystore' ? 'easystore_created' : 'zort_created',
      orderProvider: options.provider || 'zort',
      providerOrderId: options.provider === 'easystore' ? 'es_1001' : 'zort_1001',
    },
  }),
}))

describe('OmniWorkbench', () => {
  beforeEach(() => {
    omniMock.subscribers = []
    localStorage.clear()
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  it('renders inbox, clean AI draft button, order desk, and payment desk without system tools in context', async () => {
    render(<OmniWorkbench />)
    expect(await screen.findByText('กล่องรวม')).toBeInTheDocument()
    expect((await screen.findAllByText('MAN KYND')).length).toBeGreaterThan(0)
    expect((await screen.findAllByText('AnnaLynn')).length).toBeGreaterThan(0)
    expect(await screen.findByText('tiktok')).toBeInTheDocument()
    expect((await screen.findAllByText('Viris Zamara')).length).toBeGreaterThan(0)
    expect(await screen.findByRole('button', { name: 'AI ร่างให้' })).toBeInTheDocument()
    expect(screen.queryByText('AI ทำอะไรอยู่')).not.toBeInTheDocument()
    expect(screen.queryByText('AI ร่างคำตอบแล้ว')).not.toBeInTheDocument()
    expect(await screen.findByText('ออเดอร์')).toBeInTheDocument()
    expect(await screen.findByText('ชำระเงิน')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ชำระเงิน' }))
    expect(await screen.findByText('ข้อความที่จะส่ง')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'สร้าง KGP link' })).toBeDisabled()
    expect(screen.queryByText('Connector Health')).not.toBeInTheDocument()
    expect(screen.queryByText('TikTok Order Sync')).not.toBeInTheDocument()
    expect(screen.queryByText('Facebook Live Preview')).not.toBeInTheDocument()
  })

  it('shows only the active chat customer in the profile tab', async () => {
    render(<OmniWorkbench />)

    expect(await screen.findByText('กล่องรวม')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'โปรไฟล์' }))

    expect(await screen.findByText('โปรไฟล์ลูกค้าปัจจุบัน')).toBeInTheDocument()
    expect((await screen.findAllByText('ลูกค้า A')).length).toBeGreaterThan(0)
    expect(await screen.findByText('fb_customer_a')).toBeInTheDocument()
    expect(screen.queryByText('ลูกค้า B')).not.toBeInTheDocument()
    expect(screen.queryByText('โปรไฟล์เพจ')).not.toBeInTheDocument()
  })

  it('lets the operator switch through EasyStore-style chat, post, live, and report workflows', async () => {
    render(<OmniWorkbench />)

    expect(await screen.findByRole('button', { name: 'แชท' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ตั้งค่า' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'โพสต์' }))

    expect(await screen.findByRole('heading', { name: 'โพสต์' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'ตั้งค่า Post Selling Session' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'ข้อความ' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'คำสั่งซื้อ (0)' })).toBeInTheDocument()
    expect(await screen.findByText('ยังไม่มีคำสั่งซื้อจากโพสต์นี้')).toBeInTheDocument()
    expect(screen.queryByText('tt_order_1')).not.toBeInTheDocument()
    expect(await screen.findByText('เปิดขาย BLACK-M')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /จับ CF/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /สร้าง draft จาก CF/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /เปิดขาย BLACK-M/ }))
    expect((await screen.findAllByText('เชื่อมโพสต์แล้ว')).length).toBeGreaterThan(0)
    fireEvent.change(screen.getByLabelText('ค้นหาสินค้า'), { target: { value: 'Lorra' } })
    fireEvent.click(screen.getByRole('button', { name: 'ค้นหา' }))
    fireEvent.click(await screen.findByRole('button', { name: /lorสีดำXL · Lorra สีดำ XL/ }))
    expect(await screen.findByText('Session rule · lorสีดำXL')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'เปิดการขาย' }))
    expect(await screen.findByText(/บันทึกเป็น session state/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'ไลฟ์' }))
    expect(await screen.findByRole('heading', { name: 'ไลฟ์สตรีม' })).toBeInTheDocument()
    expect(await screen.findByText('fallback_live_post_comment_capture')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'รายงาน' }))
    expect(await screen.findByRole('heading', { name: 'รายงานปริมาณการส่งข้อความ' })).toBeInTheDocument()
    expect(await screen.findByText('รวมทั้งหมด')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Export CSV')).toBeInTheDocument()
  })

  it('shows a guarded order draft workflow beside the active chat', async () => {
    render(<OmniWorkbench />)
    const draftBox = await screen.findByPlaceholderText(/พิมพ์ข้อความตอบลูกค้า/)

    fireEvent.click(await screen.findByRole('button', { name: 'ออเดอร์' }))

    expect(await screen.findByRole('heading', { name: 'คำสั่งซื้อใหม่' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'AI ดึงที่อยู่จากแชท' }))
    expect(await screen.findByText('เติมฟอร์มแล้ว และใส่ข้อความให้ลูกค้าตรวจที่อยู่ในกล่องตอบแล้ว')).toBeInTheDocument()
    expect(draftBox.value).toContain('รบกวนตรวจสอบที่อยู่จัดส่งนี้ให้หน่อยค่ะ')
    expect(await screen.findByText('draft ให้ลูกค้าตรวจที่อยู่')).toBeInTheDocument()
    expect(screen.getByLabelText('ชื่อผู้รับ')).toHaveValue('ลูกค้า A')
    expect(screen.getByLabelText('เบอร์โทร')).toHaveValue('0812345678')
    expect(screen.getByLabelText('บ้านเลขที่ / ถนน / หมู่บ้าน')).toHaveValue('99/1 ถนนสุขุมวิท')
    expect(screen.getByLabelText('รหัสไปรษณีย์')).toHaveValue('10110')
    fireEvent.change(screen.getByLabelText('ค้นสินค้า ZORT'), { target: { value: 'BLACK-M' } })
    fireEvent.click(screen.getByRole('button', { name: 'ค้น ZORT' }))
    expect(await screen.findByText('Black Shirt M')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'เลือก BLACK-M' }))
    expect(await screen.findByText('พบที่อยู่ 1 รายการ · ครอบคลุม 77 จังหวัด')).toBeInTheDocument()
    expect(await screen.findByText('คลองตัน')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'บันทึก draft ออเดอร์' }))
    expect(await screen.findByText('draft: order_draft_1')).toBeInTheDocument()
    expect(draftBox.value).toContain('สรุปออเดอร์')
    expect(draftBox.value).toContain('BLACK-M x 1')
    expect(draftBox.value).toContain('ยอดรวม ฿590')
    expect((await screen.findAllByText(/99\/1 ถนนสุขุมวิท/)).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Approve ไป ZORT' }))
    expect(await screen.findByText('ยืนยัน approval ก่อนสร้าง ZORT order')).toBeInTheDocument()
    expect((await screen.findAllByText(/ผู้รับ: ลูกค้า A/)).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยันสร้าง ZORT order' }))
    expect(await screen.findByText('สร้าง ZORT order แล้ว zort_1001')).toBeInTheDocument()
  })

  it('lets the operator switch order creation to EasyStore', async () => {
    render(<OmniWorkbench />)
    const draftBox = await screen.findByPlaceholderText(/พิมพ์ข้อความตอบลูกค้า/)

    fireEvent.click(await screen.findByRole('button', { name: 'ออเดอร์' }))
    fireEvent.click(await screen.findByRole('button', { name: 'EasyStore' }))

    expect(await screen.findByText('EasyStore order draft')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'AI ดึงที่อยู่จากแชท' }))
    expect(await screen.findByText('เติมฟอร์มแล้ว และใส่ข้อความให้ลูกค้าตรวจที่อยู่ในกล่องตอบแล้ว')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('ค้นสินค้า EasyStore'), { target: { value: 'Lorra' } })
    fireEvent.click(screen.getByRole('button', { name: 'ค้น EasyStore' }))
    expect(await screen.findByText('Lorra เดรสเชิ้ต Polo')).toBeInTheDocument()
    expect(await screen.findByText('ดำ / XL')).toBeInTheDocument()
    expect(await screen.findByText('รหัส lorสีดำXL')).toBeInTheDocument()
    expect(await screen.findByText('สี ดำ')).toBeInTheDocument()
    expect(await screen.findByText('ไซซ์ XL')).toBeInTheDocument()
    expect(await screen.findByText('จำนวน 13')).toBeInTheDocument()
    expect(screen.getByAltText('Lorra สีดำ XL')).toHaveAttribute('src', 'https://cdn.example/lorra.jpg')
    fireEvent.click(screen.getByRole('button', { name: 'เลือก lorสีดำXL' }))
    expect(await screen.findByText('พบที่อยู่ 1 รายการ · ครอบคลุม 77 จังหวัด')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'บันทึก draft ออเดอร์' }))
    expect(await screen.findByText('draft: order_draft_1')).toBeInTheDocument()
    expect(draftBox.value).toContain('สรุปออเดอร์')
    expect(draftBox.value).toContain('lorสีดำXL x 1')
    fireEvent.click(screen.getByRole('button', { name: 'Approve ไป EasyStore' }))
    expect(await screen.findByText('ยืนยัน approval ก่อนสร้าง EasyStore order')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยันสร้าง EasyStore order' }))
    expect(await screen.findByText('สร้าง EasyStore order แล้ว es_1001')).toBeInTheDocument()
  })

  it('lets the operator turn off the order approval guard from the order desk', async () => {
    render(<OmniWorkbench />)

    fireEvent.click(await screen.findByRole('button', { name: 'ออเดอร์' }))
    expect(await screen.findByRole('button', { name: /guard เปิด/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /guard เปิด/ }))
    expect(await screen.findByRole('button', { name: /guard ปิด/ })).toBeInTheDocument()
    expect(await screen.findByText('ปิด approval guard แล้ว')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'AI ดึงที่อยู่จากแชท' }))
    expect(await screen.findByText('เติมฟอร์มแล้ว และใส่ข้อความให้ลูกค้าตรวจที่อยู่ในกล่องตอบแล้ว')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('ค้นสินค้า ZORT'), { target: { value: 'BLACK-M' } })
    fireEvent.click(screen.getByRole('button', { name: 'ค้น ZORT' }))
    expect(await screen.findByText('Black Shirt M')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'เลือก BLACK-M' }))
    expect(await screen.findByText('พบที่อยู่ 1 รายการ · ครอบคลุม 77 จังหวัด')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'บันทึก draft ออเดอร์' }))
    expect(await screen.findByText('draft: order_draft_1')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve ไป ZORT' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'สร้าง ZORT order ทันที' }))
    expect(await screen.findByText('สร้าง ZORT order แล้ว zort_1001')).toBeInTheDocument()
  })

  it('keeps manual draft text visible in the composer instead of saving a hidden draft bubble', async () => {
    render(<OmniWorkbench />)
    const draftBox = await screen.findByPlaceholderText(/พิมพ์ข้อความตอบลูกค้า/)

    fireEvent.change(draftBox, { target: { value: 'ตอบจากช่องพิมพ์ใหม่' } })

    expect(draftBox).toHaveValue('ตอบจากช่องพิมพ์ใหม่')
    expect(screen.queryByRole('button', { name: 'บันทึก draft' })).not.toBeInTheDocument()
    expect(screen.queryByText('Draft ยังไม่ส่งออกไปหาลูกค้า ปุ่มส่งลูกค้าจริงใช้ได้เมื่อเปิด “ส่งจริงเปิด”')).not.toBeInTheDocument()
  })

  it('clears composer text from the small top-right x button instead of a text clear button', async () => {
    render(<OmniWorkbench />)
    const draftBox = await screen.findByPlaceholderText(/พิมพ์ข้อความตอบลูกค้า/)

    fireEvent.change(draftBox, { target: { value: 'ข้อความที่ต้องล้าง' } })

    expect(screen.queryByRole('button', { name: 'ล้าง' })).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'ล้างข้อความ' }))

    expect(draftBox).toHaveValue('')
    expect(screen.queryByRole('button', { name: 'ล้างข้อความ' })).not.toBeInTheDocument()
  })

  it('shows the customer send guard in the active chat surface', async () => {
    render(<OmniWorkbench />)

    expect(await screen.findByRole('switch', { name: /ส่งลูกค้าจริง Draft only/ })).toBeInTheDocument()
    expect(await screen.findByText('Draft only: ลูกค้ายังไม่เห็นข้อความจนกว่าจะเปิดส่งจริง')).toBeInTheDocument()
  })

  it('sends a manual reply with one click after customer send is enabled', async () => {
    render(<OmniWorkbench />)
    const draftBox = await screen.findByPlaceholderText(/พิมพ์ข้อความตอบลูกค้า/)

    fireEvent.click(await screen.findByRole('switch', { name: /Draft only/ }))
    expect(await screen.findByRole('switch', { name: /ส่งจริงเปิด/ })).toBeInTheDocument()

    fireEvent.change(draftBox, { target: { value: 'ส่งจริงจากช่องพิมพ์' } })
    fireEvent.click(screen.getByRole('button', { name: 'ส่งลูกค้าจริง' }))
    await waitFor(() => {
      expect(screen.getByText('ส่งจริงจากช่องพิมพ์')).toBeInTheDocument()
    })
    expect(screen.getAllByText('ส่งจริง').length).toBeGreaterThan(0)
  })

  it('sends a suggested EasyStore product image only after send-real is enabled and clicked', async () => {
    render(<OmniWorkbench />)
    const draftBox = await screen.findByPlaceholderText(/พิมพ์ข้อความตอบลูกค้า/)

    fireEvent.click(await screen.findByRole('button', { name: 'สินค้า' }))
    fireEvent.click(await screen.findByRole('tab', { name: 'สินค้าในแชท' }))
    fireEvent.click(await screen.findByText('ใช้รูปนี้'))
    await waitFor(() => {
      expect(draftBox).toHaveValue('ส่งภาพ เสื้อเชิ้ตโปโลผู้หญิง สีดำ ให้ดูค่ะ')
    })

    fireEvent.click(await screen.findByRole('switch', { name: /Draft only/ }))
    fireEvent.click(screen.getByRole('button', { name: 'ส่งลูกค้าจริง' }))

    await waitFor(() => {
      expect(screen.getByText('ส่งภาพ เสื้อเชิ้ตโปโลผู้หญิง สีดำ ให้ดูค่ะ')).toBeInTheDocument()
    })
    expect(screen.getAllByAltText('เสื้อเชิ้ตโปโลผู้หญิง สีดำ M').length).toBeGreaterThan(0)
  })

  it('places an AI draft into the reply composer for review', async () => {
    render(<OmniWorkbench />)
    const draftBox = await screen.findByPlaceholderText(/พิมพ์ข้อความตอบลูกค้า/)

    fireEvent.click(await screen.findByRole('button', { name: 'AI ร่างให้' }))

    await waitFor(() => {
      expect(draftBox).toHaveValue('เดี๋ยวเช็กสต็อกให้ค่ะ')
    })
    expect(await screen.findByText('AI ร่างให้แล้ว ตรวจในช่องตอบก่อนส่งจริง')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'วางในช่องตอบ' })).not.toBeInTheDocument()
  })

  it('lets the operator save a rich message campaign brief from the AI context tab', async () => {
    render(<OmniWorkbench />)

    const richMessageInput = await screen.findByLabelText('หัวข้อด่วนให้ AI ย้ำครั้งแรก')
    fireEvent.change(richMessageInput, { target: { value: '6.6 ออกตัวแรงลดยกล้อ' } })
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกหัวข้อด่วน' }))

    expect(await screen.findByText('บันทึกหัวข้อด่วนแล้ว')).toBeInTheDocument()
    expect(richMessageInput).toHaveValue('6.6 ออกตัวแรงลดยกล้อ')
  })

  it('lets the operator save a size chart image URL for AI carousel replies', async () => {
    render(<OmniWorkbench />)

    const sizeChartInput = await screen.findByLabelText('ลิงก์รูปตารางไซซ์')
    fireEvent.change(sizeChartInput, { target: { value: 'https://cdn.example/size-chart.jpg' } })
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกรูปตารางไซซ์' }))

    expect(await screen.findByText('บันทึกรูปตารางไซซ์แล้ว')).toBeInTheDocument()
    expect(sizeChartInput).toHaveValue('https://cdn.example/size-chart.jpg')
  })

  it('shows sales context and places a suggested product image into the draft composer', async () => {
    render(<OmniWorkbench />)
    const draftBox = await screen.findByPlaceholderText(/พิมพ์ข้อความตอบลูกค้า/)

    fireEvent.click(await screen.findByRole('button', { name: 'สินค้า' }))
    fireEvent.click(await screen.findByRole('tab', { name: 'สินค้าในแชท' }))

    expect(await screen.findByText('ลูกค้าเดิม')).toBeInTheDocument()
    expect(await screen.findByText('081***5678')).toBeInTheDocument()
    expect(await screen.findByText('เสื้อเชิ้ตโปโลผู้หญิง สีดำ')).toBeInTheDocument()
    fireEvent.click(await screen.findByText('ใช้รูปนี้'))

    await waitFor(() => {
      expect(draftBox).toHaveValue('ส่งภาพ เสื้อเชิ้ตโปโลผู้หญิง สีดำ ให้ดูค่ะ')
    })
    expect(screen.getAllByAltText('เสื้อเชิ้ตโปโลผู้หญิง สีดำ M').length).toBeGreaterThan(0)
    expect(screen.getByText('Draft only: ลูกค้ายังไม่เห็นข้อความจนกว่าจะเปิดส่งจริง')).toBeInTheDocument()
  })

  it('moves EasyStore product search into the product context tab and removes the composer product button', async () => {
    render(<OmniWorkbench />)
    const draftBox = await screen.findByPlaceholderText(/พิมพ์ข้อความตอบลูกค้า/)

    expect(screen.queryByRole('button', { name: 'ขาย' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'สินค้า' })).toHaveLength(1)

    fireEvent.click(await screen.findByRole('button', { name: 'สินค้า' }))

    expect(await screen.findByLabelText('ค้นสินค้า EasyStore')).toBeInTheDocument()
    expect(await screen.findByText('Lorra เดรสเชิ้ต Polo')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('ค้นสินค้า EasyStore'), { target: { value: 'lorra red' } })
    fireEvent.click(screen.getByRole('button', { name: 'ค้น EasyStore' }))
    fireEvent.click(await screen.findByRole('button', { name: 'ใช้ตอบ lorสีดำXL' }))

    expect(await screen.findByText(/ใส่สินค้าในกล่องตอบแล้ว: Lorra เดรสเชิ้ต Polo/)).toBeInTheDocument()
    expect(draftBox.value).toContain('แนะนำตัวนี้ค่ะ: Lorra เดรสเชิ้ต Polo')
    expect(draftBox.value).toContain('SKU: lorสีดำXL')
    expect(screen.getAllByAltText('Lorra สีดำ XL').length).toBeGreaterThan(0)
  })

  it('renders EasyStore products as square grid tiles with only name sku and quantity details', async () => {
    render(<OmniWorkbench />)

    fireEvent.click(await screen.findByRole('button', { name: 'สินค้า' }))

    const gridToggle = await screen.findByRole('button', { name: 'มุมมองกริดสินค้า' })
    expect(gridToggle).toHaveAttribute('aria-pressed', 'true')

    const grid = await screen.findByRole('grid', { name: 'รายการสินค้า EasyStore' })
    expect(grid).toHaveAttribute('data-view', 'grid')
    const productTile = within(grid).getByRole('gridcell', { name: /Lorra เดรสเชิ้ต Polo/ })
    expect(within(productTile).getByAltText('Lorra สีดำ XL')).toHaveClass('aspect-square')
    expect(within(productTile).getByText('Lorra เดรสเชิ้ต Polo')).toBeInTheDocument()
    expect(within(productTile).getByText('SKU: lorสีดำXL')).toBeInTheDocument()
    expect(within(productTile).getByText('13 ชิ้น')).toBeInTheDocument()
    expect(within(productTile).queryByText('สีดำ')).not.toBeInTheDocument()
    expect(within(productTile).queryByText('ไซซ์ XL')).not.toBeInTheDocument()
    expect(within(productTile).queryByText('ราคา ฿690')).not.toBeInTheDocument()
  })

  it('switches product context between chat product and EasyStore list tabs', async () => {
    render(<OmniWorkbench />)

    fireEvent.click(await screen.findByRole('button', { name: 'สินค้า' }))

    const productListTab = await screen.findByRole('tab', { name: 'รายการสินค้า' })
    const chatProductTab = await screen.findByRole('tab', { name: 'สินค้าในแชท' })
    expect(productListTab).toHaveAttribute('aria-selected', 'true')
    expect(chatProductTab).toHaveAttribute('aria-selected', 'false')
    expect(await screen.findByLabelText('ค้นสินค้า EasyStore')).toBeInTheDocument()

    fireEvent.click(chatProductTab)
    expect(chatProductTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByLabelText('ค้นสินค้า EasyStore')).not.toBeInTheDocument()
    expect(await screen.findByText('เสื้อเชิ้ตโปโลผู้หญิง สีดำ')).toBeInTheDocument()
    expect(screen.getByText('รูปแนะนำ')).toBeInTheDocument()

    fireEvent.click(productListTab)
    expect(productListTab).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByRole('grid', { name: 'รายการสินค้า EasyStore' })).toBeInTheDocument()
  })

  it('switches the product list between grid and line icon views with active styling', async () => {
    render(<OmniWorkbench />)

    fireEvent.click(await screen.findByRole('button', { name: 'สินค้า' }))

    const gridToggle = await screen.findByRole('button', { name: 'มุมมองกริดสินค้า' })
    const lineToggle = await screen.findByRole('button', { name: 'มุมมองรายการสินค้า' })
    expect(gridToggle).toHaveAttribute('aria-pressed', 'true')
    expect(lineToggle).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(lineToggle)
    expect(lineToggle).toHaveAttribute('aria-pressed', 'true')
    expect(gridToggle).toHaveAttribute('aria-pressed', 'false')
    expect(await screen.findByRole('grid', { name: 'รายการสินค้า EasyStore' })).toHaveAttribute('data-view', 'line')

    fireEvent.click(gridToggle)
    expect(gridToggle).toHaveAttribute('aria-pressed', 'true')
    expect(lineToggle).toHaveAttribute('aria-pressed', 'false')
    expect(await screen.findByRole('grid', { name: 'รายการสินค้า EasyStore' })).toHaveAttribute('data-view', 'grid')
  })

  it('allows SKU search while the default EasyStore preload is still pending', async () => {
    searchEasyStoreProducts
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockImplementationOnce(async () => ({
        ok: true,
        products: [{
          id: '76019999',
          productId: '16469999',
          variantId: '76019999',
          sku: 'amdสีน้ำตาลเข้ม99',
          name: 'Amanda Jumpsuit น้ำตาล',
          productName: 'Amanda Jumpsuit',
          imageUrl: 'https://cdn.example/amanda.jpg',
          availableStock: 9,
        }],
      }))

    render(<OmniWorkbench />)
    fireEvent.click(await screen.findByRole('button', { name: 'สินค้า' }))

    const input = await screen.findByLabelText('ค้นสินค้า EasyStore')
    fireEvent.change(input, { target: { value: 'amdสีน้ำตาลเข้ม99' } })
    fireEvent.click(screen.getByRole('button', { name: 'ค้น EasyStore' }))

    await waitFor(() => {
      expect(searchEasyStoreProducts).toHaveBeenCalledWith('amdสีน้ำตาลเข้ม99', 12)
    })
    expect(await screen.findByText(/พบสินค้า 1 รายการ/)).toBeInTheDocument()
    expect(await screen.findByText('SKU: amdสีน้ำตาลเข้ม99')).toBeInTheDocument()
  })

  it('creates an EasyStore product draft from the selected thread without sending', async () => {
    render(<OmniWorkbench />)
    const draftBox = await screen.findByPlaceholderText(/พิมพ์ข้อความตอบลูกค้า/)

    fireEvent.click(await screen.findByRole('button', { name: 'สินค้า' }))
    fireEvent.change(await screen.findByLabelText('ค้นสินค้า EasyStore'), { target: { value: 'Lorra' } })
    fireEvent.click(screen.getByRole('button', { name: 'ค้น EasyStore' }))
    fireEvent.click(await screen.findByRole('button', { name: 'ใช้ตอบ lorสีดำXL' }))

    expect(await screen.findByText(/ใส่สินค้าในกล่องตอบแล้ว: Lorra เดรสเชิ้ต Polo/)).toBeInTheDocument()
    expect(draftBox.value).toContain('แนะนำตัวนี้ค่ะ: Lorra เดรสเชิ้ต Polo')
    expect(draftBox.value).toContain('SKU: lorสีดำXL')
    expect(screen.getAllByAltText('Lorra สีดำ XL').length).toBeGreaterThan(0)
    expect(screen.queryByText('Draft ยังไม่ส่งออกไปหาลูกค้า ปุ่มส่งลูกค้าจริงใช้ได้เมื่อเปิด “ส่งจริงเปิด”')).not.toBeInTheDocument()
  })

  it('places a new payment request message into the reply composer immediately', async () => {
    render(<OmniWorkbench />)
    const draftBox = await screen.findByPlaceholderText(/พิมพ์ข้อความตอบลูกค้า/)

    fireEvent.click(await screen.findByRole('button', { name: 'ชำระเงิน' }))
    fireEvent.change(screen.getByLabelText('ยอดที่ต้องเรียกเก็บ'), { target: { value: '729' } })
    fireEvent.click(screen.getByRole('button', { name: 'สร้างร่างชำระเงิน' }))

    await waitFor(() => {
      expect(draftBox.value).toContain('สรุปยอดชำระค่ะ')
    })
    expect(draftBox.value).toContain('ยอดชำระ: THB 729')
  })

  it('plays notification sound for new inbound messages only while sound is enabled', async () => {
    const oscillatorStart = vi.fn()
    const oscillatorStop = vi.fn()
    const connect = vi.fn()
    const audioContext = {
      currentTime: 10,
      createOscillator: () => ({
        type: '',
        frequency: { value: 0 },
        connect,
        start: oscillatorStart,
        stop: oscillatorStop,
      }),
      createGain: () => ({
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect,
      }),
      destination: {},
      resume: vi.fn(),
    }
    vi.stubGlobal('AudioContext', vi.fn(function FakeAudioContext() {
      return audioContext
    }))

    render(<OmniWorkbench />)
    const soundSwitch = await screen.findByRole('switch', { name: /เสียงปิด/ })

    expect(oscillatorStart).not.toHaveBeenCalled()
    fireEvent.click(soundSwitch)
    expect(await screen.findByRole('switch', { name: /เสียงเปิด/ })).toBeInTheDocument()

    act(() => {
      omniMock.subscribers.at(-1)?.({
        pages: [{ id: 'page_mankynd', name: 'MAN KYND', status: 'active' }],
        platformAccounts: [{ id: 'acct_fb_mankynd', pageId: 'page_mankynd', platform: 'facebook' }],
        threads: [{ id: 'thread_1', customerId: 'cust_1', pageId: 'page_mankynd', platform: 'facebook', status: 'open', intent: 'stock', risk: 'low', unreadCount: 2 }],
        messages: [
          { id: 'msg_1', threadId: 'thread_1', direction: 'inbound', authorName: 'ลูกค้า A', text: 'มีไซซ์ M สีดำไหม' },
          { id: 'msg_2', threadId: 'thread_1', direction: 'inbound', authorName: 'ลูกค้า A', text: 'ยังอยู่ไหม' },
        ],
        customers: [{ id: 'cust_1', displayName: 'ลูกค้า A' }],
        orders: [],
        aiDecisions: [],
        paymentRequests: [],
        connectorHealth: [],
      })
    })

    await waitFor(() => {
      expect(oscillatorStart).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('switch', { name: /เสียงเปิด/ }))
    expect(await screen.findByRole('switch', { name: /เสียงปิด/ })).toBeInTheDocument()

    act(() => {
      omniMock.subscribers.at(-1)?.({
        pages: [{ id: 'page_mankynd', name: 'MAN KYND', status: 'active' }],
        platformAccounts: [{ id: 'acct_fb_mankynd', pageId: 'page_mankynd', platform: 'facebook' }],
        threads: [{ id: 'thread_1', customerId: 'cust_1', pageId: 'page_mankynd', platform: 'facebook', status: 'open', intent: 'stock', risk: 'low', unreadCount: 3 }],
        messages: [
          { id: 'msg_1', threadId: 'thread_1', direction: 'inbound', authorName: 'ลูกค้า A', text: 'มีไซซ์ M สีดำไหม' },
          { id: 'msg_2', threadId: 'thread_1', direction: 'inbound', authorName: 'ลูกค้า A', text: 'ยังอยู่ไหม' },
          { id: 'msg_3', threadId: 'thread_1', direction: 'inbound', authorName: 'ลูกค้า A', text: 'ตอบหน่อย' },
        ],
        customers: [{ id: 'cust_1', displayName: 'ลูกค้า A' }],
        orders: [],
        aiDecisions: [],
        paymentRequests: [],
        connectorHealth: [],
      })
    })

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(oscillatorStart).toHaveBeenCalledTimes(1)
  })

  it('surfaces new AI approvals with a visible queue alert and sound', async () => {
    const oscillatorStart = vi.fn()
    const oscillatorStop = vi.fn()
    const connect = vi.fn()
    const audioContext = {
      currentTime: 10,
      createOscillator: () => ({
        type: '',
        frequency: { value: 0 },
        connect,
        start: oscillatorStart,
        stop: oscillatorStop,
      }),
      createGain: () => ({
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect,
      }),
      destination: {},
      resume: vi.fn(),
    }
    vi.stubGlobal('AudioContext', vi.fn(function FakeAudioContext() {
      return audioContext
    }))

    render(<OmniWorkbench />)
    fireEvent.click(await screen.findByRole('switch', { name: /เสียงปิด/ }))

    act(() => {
      omniMock.subscribers.at(-1)?.({
        pages: [{ id: 'page_mankynd', name: 'MAN KYND', status: 'active' }],
        platformAccounts: [{ id: 'acct_fb_mankynd', pageId: 'page_mankynd', platform: 'facebook' }],
        threads: [{ id: 'thread_1', customerId: 'cust_1', pageId: 'page_mankynd', platform: 'facebook', status: 'needs_approval', intent: 'productImage', risk: 'medium', unreadCount: 1 }],
        messages: [{ id: 'msg_1', threadId: 'thread_1', direction: 'inbound', authorName: 'ลูกค้า A', text: 'ขอดูรูปสินค้า', createdAt: '2026-06-05T10:00:00.000Z' }],
        customers: [{ id: 'cust_1', displayName: 'ลูกค้า A' }],
        orders: [],
        aiDecisions: [{ id: 'decision_needs_approval', threadId: 'thread_1', action: 'needs_approval', intent: 'productImage', risk: 'medium', reason: 'image_attachment_required', createdAt: '2026-06-05T10:01:00.000Z' }],
        paymentRequests: [],
        connectorHealth: [],
      })
    })

    expect(await screen.findByText('AI รออนุมัติ 1 เคส')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /เปิดเคส ลูกค้า A/ })).toBeInTheDocument()
    expect(screen.getAllByText('ต้องอนุมัติ AI').length).toBeGreaterThan(0)
    await waitFor(() => {
      expect(oscillatorStart).toHaveBeenCalledTimes(1)
    })
  })

  it('keeps AI approval alert visible outside chat mode and opens the queued thread', async () => {
    render(<OmniWorkbench />)

    fireEvent.click(await screen.findByRole('button', { name: 'โพสต์' }))
    expect(await screen.findByRole('heading', { name: 'โพสต์' })).toBeInTheDocument()

    act(() => {
      omniMock.subscribers.at(-1)?.({
        pages: [{ id: 'page_mankynd', name: 'MAN KYND', status: 'active' }],
        platformAccounts: [{ id: 'acct_fb_mankynd', pageId: 'page_mankynd', platform: 'facebook' }],
        threads: [{ id: 'thread_1', customerId: 'cust_1', pageId: 'page_mankynd', platform: 'facebook', status: 'needs_approval', intent: 'productImage', risk: 'medium', unreadCount: 1 }],
        messages: [{ id: 'msg_approval', threadId: 'thread_1', direction: 'inbound', authorName: 'ลูกค้า A', text: 'ขอดูรูปสินค้า', createdAt: '2026-06-05T10:00:00.000Z' }],
        customers: [{ id: 'cust_1', displayName: 'ลูกค้า A' }],
        orders: [],
        aiDecisions: [{ id: 'decision_needs_approval_post', threadId: 'thread_1', action: 'needs_approval', intent: 'productImage', risk: 'medium', reason: 'image_attachment_required', createdAt: '2026-06-05T10:01:00.000Z' }],
        paymentRequests: [],
        connectorHealth: [],
      })
    })

    expect(await screen.findByText('AI รออนุมัติ 1 เคส')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /เปิดเคส ลูกค้า A/ }))

    expect(await screen.findByText('กล่องรวม')).toBeInTheDocument()
    expect(screen.getAllByText('ต้องอนุมัติ AI').length).toBeGreaterThan(0)
  })
})
