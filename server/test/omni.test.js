import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { OMNI_STATUSES, validatePage } from '../src/omni/schema.js'
import { createOmniSeed } from '../src/omni/seed.js'
import { createAdapterRegistry } from '../src/omni/adapters.js'
import { createOmniService } from '../src/omni/service.js'
import { listFacebookConversations, normalizeMetaConversations, sendFacebookCommentReply, sendFacebookReply, sendInstagramCommentReply } from '../src/omni/metaInboxClient.js'
import { loadPageRegistry } from '../src/omni/pageRegistry.js'
import { createMetaSocialRuntime } from '../src/omni/metaSocialRuntime.js'
import { createAiReplyEngine } from '../src/omni/aiReplyEngine.js'
import { normalizeMetaWebhookPayload } from '../src/omni/metaWebhook.js'
import { normalizeEasyStoreWebhookPayload } from '../src/omni/easystoreWebhook.js'
import { buildMetaCatalogRows, toMetaCatalogCsv } from '../src/omni/easystoreMetaFeed.js'
import { listTikTokOrders, normalizeTikTokOrders } from '../src/omni/tiktokOrderClient.js'
import { normalizeTikTokMessagingWebhookPayload } from '../src/omni/tiktokMessagingClient.js'
import { getOmniSchemaSummary, loadOmniSchemaSql, REQUIRED_OMNI_TABLES } from '../src/omni/db/schema.js'
import { createSqliteOmniStore } from '../src/omni/db/sqliteStore.js'
import { mountRoutes } from '../src/routes.js'
import { mountWebhook } from '../src/webhook.js'
import { createState } from '../src/state.js'
import { createEasyStoreRuntime } from '../src/omni/easystoreRuntime.js'
import { buildMetaCatalogBatchRequests, createMetaCatalogRuntime } from '../src/omni/metaCatalogRuntime.js'
import { createZortCommerceRuntime } from '../src/omni/zortCommerceRuntime.js'

test('omni seed starts with configured production page data', () => {
  const seed = createOmniSeed()
  assert.equal(seed.pages.length, 7)
  assert.equal(seed.pages.find((page) => page.id === 'page_annalynn').name, 'Anna Lynn')
  assert.equal(seed.pages.find((page) => page.id === 'page_ig_annalynn').name, 'Anna Lynn IG')
  assert.equal(seed.pages.find((page) => page.id === 'page_annalynn_tiktok').name, 'AnnaLynn')
  assert.equal(seed.pages.find((page) => page.id === 'page_easystore_annalynna').name, 'AnnaLynn EasyStore')
  assert.equal(seed.platformAccounts.find((account) => account.id === 'acct_fb_annalynn').pageId, 'page_annalynn')
  assert.equal(seed.platformAccounts.find((account) => account.id === 'acct_ig_annalynn').pageId, 'page_ig_annalynn')
  assert.equal(seed.platformAccounts.find((account) => account.id === 'acct_tt_shop').pageId, 'page_annalynn_tiktok')
  assert.equal(seed.platformAccounts.find((account) => account.id === 'acct_tt_annalynn_dm').provider, 'tiktok_business_messaging')
  assert.equal(seed.platformAccounts.find((account) => account.id === 'acct_es_annalynna').provider, 'easystore')
  assert.ok(seed.pages.find((page) => page.id === 'page_fb_112154661515664'))
  assert.equal(seed.pages.find((page) => page.id === 'page_fb_112154661515664').name, 'Viris Zamara')
  assert.equal(seed.pages.some((page) => page.id === 'page_shop_4'), false)
  assert.equal(seed.pages.some((page) => page.id === 'page_shop_5'), false)
  assert.equal(seed.pages.every((page) => page.status === 'active'), true)
  assert.equal(seed.pages.every((page) => page.policySetId), true)
  assert.equal(seed.pages.every((page) => page.agentProfileId), true)
  assert.equal(seed.knowledgeSources.length, 5)
  assert.equal(seed.knowledgeSources.every((source) => source.content), true)
})

test('ZORT order body includes customer and Thai shipping address fields', async () => {
  let body
  const runtime = createZortCommerceRuntime({
    runner: async (args) => {
      const bodyFile = args[args.indexOf('--body-file') + 1]
      body = JSON.parse(readFileSync(bodyFile, 'utf8'))
      return { ok: true, response: { detail: { id: 'zort_1001' } } }
    },
  })

  const result = await runtime.createOrder({
    approved: true,
    uniquenumber: 'order_draft_1',
    order: {
      id: 'order_draft_1',
      customerName: 'ลูกค้า A',
      customerPhone: '0812345678',
      customerEmail: 'buyer@example.com',
      platform: 'facebook',
      sourceRef: 'omni_manual_draft:thread_1',
      totalAmount: 590,
      shippingMethod: 'ไปรษณีย์ไทย',
      paymentMethod: 'bank_transfer',
      shippingAddress: {
        recipientName: 'ลูกค้า A',
        recipientPhone: '0812345678',
        formattedAddress: '99/1 ถนนสุขุมวิท แขวงคลองตัน เขตคลองเตย กรุงเทพมหานคร 10110',
      },
      items: [{ sku: 'BLACK-M', name: 'Black Shirt M', quantity: 1, unitPrice: 590 }],
    },
  })

  assert.equal(result.ok, true)
  assert.equal(body.customername, 'ลูกค้า A')
  assert.equal(body.customerphone, '0812345678')
  assert.match(body.customeraddress, /สุขุมวิท/)
  assert.equal(body.shippingname, 'ลูกค้า A')
  assert.equal(body.shippingphone, '0812345678')
  assert.equal(body.shippingchannel, 'ไปรษณีย์ไทย')
  assert.equal(body.paymentmethod, 'bank_transfer')
  assert.equal(body.list[0].sku, 'BLACK-M')
})

test('ZORT runtime uses direct Open API when cloud credentials are present', async () => {
  const calls = []
  const runtime = createZortCommerceRuntime({
    env: {
      ZORT_STORE_NAME: 'store_1',
      ZORT_API_KEY: 'api_key_1',
      ZORT_API_SECRET: 'api_secret_1',
    },
    apiBaseUrl: 'https://zort.example/v4',
    fetchImpl: async (url, options) => {
      calls.push({ url, options })
      if (url.includes('/Product/GetProducts')) {
        return new Response(JSON.stringify({ list: [{ id: '637', sku: 'LORRA-M', name: 'Lorra M', sellprice: 1290, availablestock: 7 }], count: 1 }), { status: 200 })
      }
      return new Response(JSON.stringify({ detail: { id: 'zort_1001' } }), { status: 200 })
    },
  })

  const products = await runtime.searchProducts({ keyword: 'Lorra', limit: 3 })
  assert.equal(products.ok, true)
  assert.equal(products.products[0].sku, 'LORRA-M')
  assert.equal(calls[0].url, 'https://zort.example/v4/Product/GetProducts?keyword=Lorra&page=1&limit=3')
  assert.equal(calls[0].options.headers.storename, 'store_1')
  assert.equal(calls[0].options.headers.apikey, 'api_key_1')
  assert.equal(calls[0].options.headers.apisecret, 'api_secret_1')

  const result = await runtime.createOrder({
    approved: true,
    uniquenumber: 'order_draft_1',
    order: {
      id: 'order_draft_1',
      customerName: 'ลูกค้า A',
      customerPhone: '0812345678',
      totalAmount: 1290,
      shippingAddress: { formattedAddress: '99/1 ถนนสุขุมวิท กรุงเทพมหานคร 10110' },
      items: [{ sku: 'LORRA-M', name: 'Lorra M', quantity: 1, unitPrice: 1290 }],
    },
  })
  assert.equal(result.providerOrderId, 'zort_1001')
  assert.equal(calls[1].url, 'https://zort.example/v4/Order/AddOrder?uniquenumber=order_draft_1')
  assert.equal(calls[1].options.method, 'POST')
  assert.equal(JSON.parse(calls[1].options.body).list[0].sku, 'LORRA-M')
})

test('ZORT runtime reports missing cloud credentials instead of spawning a missing local helper', async () => {
  const runtime = createZortCommerceRuntime({
    env: {},
    helper: '/tmp/omni-missing-zort-helper',
  })

  await assert.rejects(
    () => runtime.searchProducts({ keyword: 'Lorra' }),
    /missing_zort_credentials/,
  )
})

test('EasyStore runtime uses direct Storefront API when cloud credentials are present', async () => {
  const calls = []
  const runtime = createEasyStoreRuntime({
    env: {
      EASY_STORE_SHOP: 'annalynna.easy.co',
      EASY_STORE_ACCESS_TOKEN: 'access_token_1',
      EASY_STORE_CLIENT_ID: 'app_1',
      EASY_STORE_CLIENT_SECRET: 'secret_1',
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options })
      return new Response(JSON.stringify({ products: [{ id: 1, title: 'Lorra' }] }), {
        status: 200,
        headers: { 'X-RateLimit-Remaining': '39', 'X-RateLimit-Limit': '40' },
      })
    },
  })

  const result = await runtime.verify({ limit: 1 })

  assert.equal(result.ok, true)
  assert.equal(result.mode, 'storefront_api_ready')
  assert.equal(result.endpoint, 'GET /products.json')
  assert.equal(result.productCount, 1)
  assert.equal(calls[0].url, 'https://annalynna.easy.co/api/3.0/products.json?page=1&limit=1')
  assert.equal(calls[0].options.headers['EasyStore-Access-Token'], 'access_token_1')
})

test('EasyStore product search returns image, sku, color, size, and stock rows', async () => {
  const runtime = createEasyStoreRuntime({
    env: {
      EASY_STORE_SHOP: 'annalynna.easy.co',
      EASY_STORE_ACCESS_TOKEN: 'access_token_1',
      EASY_STORE_CLIENT_ID: 'app_1',
      EASY_STORE_CLIENT_SECRET: 'secret_1',
    },
    fetchImpl: async () => new Response(JSON.stringify({
      products: [{
        id: 16462394,
        title: 'Lorra เดรสเชิ้ต Polo',
        handle: 'lorra-polo',
        images: [{ id: 11, src: 'https://cdn.example/lorra.jpg' }],
        variants: [{
          id: 76013285,
          sku: 'lorสีดำXL',
          title: 'ดำ / XL',
          price: '690.00',
          inventory_quantity: 13,
          image_id: 11,
        }],
      }],
    }), { status: 200 }),
  })

  const result = await runtime.searchProducts({ keyword: 'lor', limit: 3 })

  assert.equal(result.ok, true)
  assert.equal(result.products[0].imageUrl, 'https://cdn.example/lorra.jpg')
  assert.equal(result.products[0].sku, 'lorสีดำXL')
  assert.equal(result.products[0].color, 'ดำ')
  assert.equal(result.products[0].size, 'XL')
  assert.equal(result.products[0].availableStock, 13)
})

test('EasyStore SKU search uses direct skus filter before paged fallback scan', async () => {
  const calls = []
  const runtime = createEasyStoreRuntime({
    env: {
      EASY_STORE_SHOP: 'annalynna.easy.co',
      EASY_STORE_ACCESS_TOKEN: 'access_token_1',
      EASY_STORE_CLIENT_ID: 'app_1',
      EASY_STORE_CLIENT_SECRET: 'secret_1',
    },
    fetchImpl: async (url) => {
      calls.push(url)
      return new Response(JSON.stringify({
        products: [{
          id: 16462524,
          title: 'Lillac Pant',
          variants: [{ id: 76012524, sku: 'llpดำ28', title: 'ดำ / 28', inventory_quantity: 4 }],
        }],
      }), { status: 200 })
    },
  })

  const result = await runtime.searchProducts({ sku: 'llpดำ28', limit: 6 })

  assert.equal(result.ok, true)
  assert.equal(result.products[0].sku, 'llpดำ28')
  assert.equal(calls.length, 1)
  assert.match(calls[0], /skus=llp/)
  assert.match(decodeURIComponent(calls[0]), /skus=llpดำ28/)
})

test('EasyStore SKU search scans beyond the first product page and prioritizes SKU matches', async () => {
  const calls = []
  const runtime = createEasyStoreRuntime({
    env: {
      EASY_STORE_SHOP: 'annalynna.easy.co',
      EASY_STORE_ACCESS_TOKEN: 'access_token_1',
      EASY_STORE_CLIENT_ID: 'app_1',
      EASY_STORE_CLIENT_SECRET: 'secret_1',
    },
    fetchImpl: async (url) => {
      calls.push(url)
      const search = new URL(url).searchParams
      if (search.get('skus')) return new Response(JSON.stringify({ products: [] }), { status: 200 })
      const page = search.get('page')
      const products = page === '2'
        ? [{
            id: 16469999,
            title: 'Amanda Jumpsuit',
            variants: [{ id: 76019999, sku: 'amdสีน้ำตาลเข้ม99', title: 'น้ำตาล / 99', inventory_quantity: 9 }],
          }]
        : Array.from({ length: 50 }, (_, index) => ({
            id: 16462000 + index,
            title: `หน้าแรก ${index}`,
            variants: [{ id: 76012000 + index, sku: `FIRST-${index}`, title: `ตัวเลือก ${index}`, inventory_quantity: 1 }],
          }))
      return new Response(JSON.stringify({ products }), { status: 200 })
    },
  })

  const result = await runtime.searchProducts({ sku: 'amdสีน้ำตาลเข้ม99', limit: 3 })

  assert.equal(result.ok, true)
  assert.equal(result.products[0].sku, 'amdสีน้ำตาลเข้ม99')
  assert.equal(result.count, 1)
  assert.equal(calls.length, 3)
  assert.match(decodeURIComponent(calls[0]), /skus=amdสีน้ำตาลเข้ม99/)
  assert.match(calls[1], /page=1&limit=50/)
  assert.match(calls[2], /page=2&limit=50/)
})

test('EasyStore product list helper uses raw JSON endpoint for fallback search', async () => {
  const calls = []
  const runtime = createEasyStoreRuntime({
    env: {},
    runner: async (args) => {
      calls.push(args)
      return { ok: true, response: { products: [{ id: 1, title: 'Lorra', variants: [{ id: 2, sku: 'LOR-XL', title: 'ดำ / XL', quantity: 4 }] }] } }
    },
  })

  const result = await runtime.searchProducts({ keyword: 'lor', limit: 8 })

  assert.equal(result.ok, true)
  assert.deepEqual(calls[0], ['raw', 'GET', '/products.json?page=1&limit=50'])
  assert.equal(result.products[0].sku, 'LOR-XL')
})

test('EasyStore runtime reports missing credentials instead of spawning a missing local helper', async () => {
  const runtime = createEasyStoreRuntime({
    env: {},
    helper: '/tmp/omni-missing-easystore-helper',
  })

  await assert.rejects(
    () => runtime.verify(),
    /missing_easystore_credentials/,
  )
})

test('EasyStore runtime returns a normalized product preview from direct API', async () => {
  const calls = []
  const runtime = createEasyStoreRuntime({
    env: {
      EASY_STORE_SHOP: 'annalynna.easy.co',
      EASY_STORE_ACCESS_TOKEN: 'access_token_1',
      EASY_STORE_CLIENT_ID: 'app_1',
      EASY_STORE_CLIENT_SECRET: 'secret_1',
      OMNI_META_PIXEL_ID: '401272399141441',
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options })
      return new Response(JSON.stringify({
        product: {
          id: 16462646,
          title: 'Amanda Jumpsuit',
          handle: 'amanda-jumpsuit',
          currency: 'THB',
          description: '<p>ชุดจั๊มสูทพร้อมส่ง</p>',
          images: [{ src: 'https://cdn.example/amanda.jpg', alt: 'Amanda Jumpsuit' }],
          variants: [
            { id: 7001, sku: 'AMANDA-BLK-M', title: 'Black / M', price: '1290.00', quantity: 3 },
            { id: 7002, sku: 'AMANDA-BLK-L', title: 'Black / L', price: '1290.00', quantity: 0 },
          ],
        },
      }), { status: 200 })
    },
  })

  const result = await runtime.getProductPreview({ productId: '16462646' })

  assert.equal(result.ok, true)
  assert.equal(result.product.id, '16462646')
  assert.equal(result.product.title, 'Amanda Jumpsuit')
  assert.equal(result.product.descriptionText, 'ชุดจั๊มสูทพร้อมส่ง')
  assert.equal(result.product.images[0].url, 'https://cdn.example/amanda.jpg')
  assert.equal(result.product.price.amount, 1290)
  assert.equal(result.product.stock.totalQuantity, 3)
  assert.equal(result.product.variants[0].sku, 'AMANDA-BLK-M')
  assert.equal(result.product.links.storefrontUrl, 'https://annalynna.easy.co/products/amanda-jumpsuit')
  assert.equal(result.tracking.pixelId, '401272399141441')
  assert.equal(calls[0].url, 'https://annalynna.easy.co/api/3.0/products/16462646.json')
})

test('EasyStore Meta catalog feed maps products to Meta CSV rows', () => {
  const rows = buildMetaCatalogRows({
    products: [{
      id: 16462646,
      title: 'Amanda Jumpsuit',
      handle: 'amanda-jumpsuit',
      currency: 'THB',
      description: '<p>Amanda&nbsp;Jumpsuit พร้อมส่ง</p>',
      images: [{ url: 'https://cdn.example/amanda.jpg' }],
      min_price: '890.0',
      total_quantity: 155,
      variants: [{ price: '890.0', inventory_quantity: 11, cost_price: '1.0' }],
    }],
    productUrlBase: 'https://annalynna.easy.co',
  })
  const csv = toMetaCatalogCsv(rows)

  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, '16462646')
  assert.equal(rows[0].availability, 'in stock')
  assert.equal(rows[0].condition, 'new')
  assert.equal(rows[0].price, '890 THB')
  assert.equal(rows[0].link, 'https://annalynna.easy.co/products/amanda-jumpsuit')
  assert.equal(rows[0].image_link, 'https://cdn.example/amanda.jpg')
  assert.equal(rows[0].brand, 'Annalynna')
  assert.match(csv, /^id,title,description,availability,condition,price,link,image_link,brand\n/)
  assert.doesNotMatch(csv, /cost_price/)
})

test('EasyStore runtime returns an automatic Meta catalog feed from direct API', async () => {
  const calls = []
  const runtime = createEasyStoreRuntime({
    env: {
      EASY_STORE_SHOP: 'annalynna.easy.co',
      EASY_STORE_ACCESS_TOKEN: 'access_token_1',
      EASY_STORE_CLIENT_ID: 'app_1',
      EASY_STORE_CLIENT_SECRET: 'secret_1',
      OMNI_PRODUCT_PREVIEW_BASE_URL: 'https://omni.oagent.biz',
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options })
      return new Response(JSON.stringify({
        products: [{
          id: 16462646,
          title: 'Amanda Jumpsuit',
          handle: 'amanda-jumpsuit',
          currency: 'THB',
          description: 'Amanda พร้อมส่ง',
          images: [{ url: 'https://cdn.example/amanda.jpg' }],
          min_price: '890.0',
          total_quantity: 155,
          variants: [{ price: '890.0', inventory_quantity: 11 }],
        }],
      }), { status: 200 })
    },
  })

  const result = await runtime.getMetaCatalogFeed()

  assert.equal(result.ok, true)
  assert.equal(result.count, 1)
  assert.equal(result.rows[0].link, 'https://annalynna.easy.co/products/amanda-jumpsuit')
  assert.equal(result.rows[0].price, '890 THB')
  assert.match(result.csv, /Amanda Jumpsuit/)
  assert.equal(calls[0].url, 'https://annalynna.easy.co/api/3.0/products.json?page=1&limit=250')
})

test('Meta Catalog runtime builds real-time batch requests from EasyStore product webhook payloads', () => {
  const result = buildMetaCatalogBatchRequests({
    topic: 'product/update',
    productUrlBase: 'https://annalynna.easy.co',
    payload: {
      product: {
        id: 16462646,
        title: 'Amanda Jumpsuit',
        handle: 'amanda-jumpsuit',
        description: '<p>Amanda&nbsp;พร้อมส่ง</p>',
        images: [{ url: 'https://cdn.example/amanda.jpg' }],
        min_price: '890.0',
        total_quantity: 12,
      },
    },
  })

  assert.equal(result.ok, true)
  assert.equal(result.requests.length, 1)
  assert.equal(result.requests[0].method, 'UPDATE')
  assert.equal(result.requests[0].retailer_id, '16462646')
  assert.equal(result.requests[0].data.url, 'https://annalynna.easy.co/products/amanda-jumpsuit')
  assert.equal(result.requests[0].data.image_url, 'https://cdn.example/amanda.jpg')
  assert.equal(result.requests[0].data.price, '890')
  assert.equal(result.requests[0].data.currency, 'THB')
})

test('Meta Catalog runtime posts guarded batch updates only when enabled and credentialed', async () => {
  const calls = []
  const runtime = createMetaCatalogRuntime({
    env: {
      META_CATALOG_SYNC_ENABLED: '1',
      META_CATALOG_ACCESS_TOKEN: 'catalog_token_1',
      META_CATALOG_ID: '1689072115772849',
      META_CATALOG_PRODUCT_URL_BASE: 'https://annalynna.easy.co',
      META_GRAPH_VERSION: 'v23.0',
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options })
      return new Response(JSON.stringify({ handles: ['h_1'] }), { status: 200 })
    },
  })

  const result = await runtime.syncEasyStoreWebhook({
    topic: 'product/create',
    shopDomain: 'annalynna.easy.co',
    payload: {
      product: {
        id: 16462646,
        title: 'Amanda Jumpsuit',
        handle: 'amanda-jumpsuit',
        description: 'Amanda พร้อมส่ง',
        images: [{ url: 'https://cdn.example/amanda.jpg' }],
        min_price: '890.0',
        total_quantity: 12,
      },
    },
  })

  assert.equal(result.ok, true)
  assert.equal(result.endpoint, 'POST /1689072115772849/batch')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://graph.facebook.com/v23.0/1689072115772849/batch')
  const body = new URLSearchParams(String(calls[0].options.body))
  assert.equal(body.get('access_token'), 'catalog_token_1')
  assert.equal(JSON.parse(body.get('requests'))[0].data.url, 'https://annalynna.easy.co/products/amanda-jumpsuit')
})

test('normalizes EasyStore order webhook payload into Omni order thread rows', () => {
  const normalized = normalizeEasyStoreWebhookPayload({
    id: 11001,
    order_number: 'AL-1001',
    financial_status: 'paid',
    fulfillment_status: 'unfulfilled',
    total_price: '1290.00',
    currency: 'THB',
    created_at: '2026-06-03T10:00:00+07:00',
    updated_at: '2026-06-03T10:05:00+07:00',
    customer: {
      id: 501,
      first_name: 'Anna',
      last_name: 'Buyer',
      email: 'buyer@example.com',
      phone: '0812345678',
    },
    shipping_address: {
      name: 'Anna Buyer',
      phone: '0812345678',
      address1: '99 Sukhumvit',
      province: 'Bangkok',
      zip: '10110',
    },
    line_items: [{
      id: 1,
      product_id: 77,
      variant_id: 88,
      sku: 'LORRA-M',
      name: 'Lorra M',
      quantity: 1,
      price: '1290.00',
    }],
  }, { topic: 'order/paid', shopDomain: 'annalynna.easy.co' })

  assert.equal(normalized.source, 'easystore_webhook')
  assert.equal(normalized.topic, 'order/paid')
  assert.equal(normalized.customers[0].id, 'es_customer_501')
  assert.equal(normalized.customers[0].phone, '0812345678')
  assert.equal(normalized.threads[0].id, 'es_order_11001')
  assert.equal(normalized.threads[0].pageId, 'page_easystore_annalynna')
  assert.equal(normalized.threads[0].platform, 'easystore')
  assert.equal(normalized.threads[0].kind, 'order_event')
  assert.equal(normalized.threads[0].status, 'open')
  assert.equal(normalized.messages[0].direction, 'system')
  assert.equal(normalized.messages[0].providerMessageId, 'order/paid:11001')
  assert.equal(normalized.orders[0].id, 'es_order_11001')
  assert.equal(normalized.orders[0].orderNumber, 'AL-1001')
  assert.equal(normalized.orders[0].total, 1290)
  assert.equal(normalized.orders[0].itemSummary[0].sellerSku, 'LORRA-M')
})

test('normalizes EasyStore product webhook payload into product thread and inventory rows', () => {
  const normalized = normalizeEasyStoreWebhookPayload({
    product: {
      id: 77,
      title: 'Lorra',
      updated_at: '2026-06-03T11:00:00+07:00',
      variants: [{ id: 88, sku: 'LORRA-M', inventory_quantity: 12, price: '1290.00' }],
    },
  }, { topic: 'product/update', shopDomain: 'annalynna.easy.co' })

  assert.equal(normalized.threads[0].id, 'es_product_77')
  assert.equal(normalized.threads[0].kind, 'product_event')
  assert.equal(normalized.threads[0].intent, 'product')
  assert.equal(normalized.messages[0].direction, 'system')
  assert.equal(normalized.inventorySnapshots[0].id, 'es_stock_77_88')
  assert.equal(normalized.inventorySnapshots[0].sku, 'LORRA-M')
  assert.equal(normalized.inventorySnapshots[0].available, 12)
})

test('normalizes TikTok Business Messaging webhook payload into Omni threads', () => {
  const normalized = normalizeTikTokMessagingWebhookPayload({
    events: [{
      conversation_id: 'conv_anna_1',
      sender: { id: 'tt_user_1', display_name: 'ลูกค้า TikTok' },
      message: { message_id: 'msg_1', text: 'มีไซซ์ไหม', timestamp: 1779470400000 },
    }],
  })

  assert.equal(normalized.source, 'tiktok_business_messaging')
  assert.equal(normalized.customers[0].id, 'ttbm_customer_tt_user_1')
  assert.equal(normalized.threads[0].id, 'ttbm_conv_anna_1')
  assert.equal(normalized.threads[0].pageId, 'page_annalynn_tiktok')
  assert.equal(normalized.messages[0].text, 'มีไซซ์ไหม')
})

test('MAN KYND seed keeps Meta provider account id for runtime sync', () => {
  const seed = createOmniSeed()
  const account = seed.platformAccounts.find((item) => item.id === 'acct_fb_mankynd')

  assert.equal(account.providerAccountId, '189971841184132')
})

test('page validation accepts active, paused, and archived statuses', () => {
  assert.deepEqual(OMNI_STATUSES.page, ['active', 'paused', 'archived'])
  assert.equal(validatePage({ id: 'page_1', name: 'MAN KYND', status: 'active' }).ok, true)
  assert.equal(validatePage({ id: 'page_2', name: '', status: 'deleted' }).ok, false)
})

test('adapter registry exposes provider-agnostic healthchecks', async () => {
  const registry = createAdapterRegistry()
  const meta = await registry.get('meta').healthcheck()
  assert.deepEqual(meta, { ok: true, provider: 'meta', mode: 'mock' })
})

test('omni service filters threads by page and blocks unsafe auto-send', () => {
  const service = createOmniService()
  assert.equal(service.listThreads({ pageId: 'page_mankynd' }).length, 1)
  const blocked = service.evaluateAutoSend({ threadId: 'thread_2' })
  assert.equal(blocked.allowed, false)
  assert.equal(blocked.reason, 'risk_not_low')
})

test('omni report date filters and hourly buckets use configured timezone', () => {
  const seed = createOmniSeed()
  seed.messages = [
    { id: 'msg_bangkok_day', threadId: 'thread_1', direction: 'inbound', authorName: 'ลูกค้า A', text: 'เข้าวันใหม่ไทย', createdAt: '2026-05-21T18:00:00.000Z' },
  ]
  const service = createOmniService(seed)

  const report = service.messageVolumeReport({ from: '2026-05-22', to: '2026-05-22' })

  assert.equal(report.timezone, 'Asia/Bangkok')
  assert.equal(report.totals.total, 1)
  assert.equal(report.byHour[1].total, 1)
  assert.match(report.from, /^2026-05-21T17:00:00/)
  assert.match(report.to, /^2026-05-22T16:59:59.999/)
})

test('chat retention deletes old message text while preserving customer phone and address', () => {
  const seed = createOmniSeed()
  seed.customers = [{ id: 'cust_retain', displayName: 'Retain Customer', matchConfidence: 1 }]
  seed.threads = [{
    id: 'thread_retain',
    pageId: 'page_annalynn',
    platform: 'facebook',
    customerId: 'cust_retain',
    status: 'open',
    intent: 'unknown',
    risk: 'low',
    unreadCount: 2,
    messageCount: 2,
    updatedAt: '2026-05-23T00:00:00.000Z',
  }]
  seed.messages = [
    {
      id: 'msg_old_contact',
      threadId: 'thread_retain',
      direction: 'inbound',
      authorName: 'Retain Customer',
      text: 'เบอร์ 081-234-5678 ที่อยู่ 99/1 ถนนสุขุมวิท แขวงคลองตัน เขตวัฒนา กรุงเทพ 10110',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'msg_recent',
      threadId: 'thread_retain',
      direction: 'inbound',
      authorName: 'Retain Customer',
      text: 'ล่าสุดยังอยู่ไหม',
      createdAt: '2026-05-23T00:00:00.000Z',
    },
  ]
  const service = createOmniService(seed)

  const dryRun = service.runChatRetention({
    now: '2026-05-24T00:00:00.000Z',
    deleteAfterDays: 30,
    dryRun: true,
  })

  assert.equal(dryRun.dryRun, true)
  assert.equal(dryRun.counts.messagesDeleted, 1)
  assert.equal(service.getThread('thread_retain').messages.length, 2)

  const result = service.runChatRetention({
    now: '2026-05-24T00:00:00.000Z',
    deleteAfterDays: 30,
    dryRun: false,
  })
  const thread = service.getThread('thread_retain')
  const customer = service.snapshot().customers.find((item) => item.id === 'cust_retain')

  assert.equal(result.counts.messagesDeleted, 1)
  assert.equal(result.counts.customersUpdated, 1)
  assert.equal(thread.messages.length, 1)
  assert.equal(thread.messages[0].id, 'msg_recent')
  assert.equal(thread.messageCount, 1)
  assert.equal(thread.unreadCount, 1)
  assert.equal(customer.phone, '0812345678')
  assert.match(customer.address, /สุขุมวิท/)
  assert.equal(customer.contactJson.sourceMessageIds[0], 'msg_old_contact')
  assert.equal(service.listRetentionRuns().length, 1)
})

test('sales context resolver returns masked customer memory from safe EasyStore match', () => {
  const seed = createOmniSeed()
  seed.customers.push({
    id: 'cust_sales_memory',
    displayName: 'Facebook Customer',
    phone: '0812345678',
    matchConfidence: 0.98,
  })
  seed.threads.push({
    id: 'thread_sales_memory',
    pageId: 'page_annalynn',
    platform: 'facebook',
    customerId: 'cust_sales_memory',
    status: 'open',
    intent: 'stock',
    risk: 'low',
    updatedAt: '2026-06-04T06:00:00.000Z',
  })
  seed.messages.push({
    id: 'msg_sales_memory',
    threadId: 'thread_sales_memory',
    direction: 'inbound',
    authorName: 'Facebook Customer',
    text: 'สนใจ Lorra สีดำ XL',
    createdAt: '2026-06-04T06:00:00.000Z',
  })
  seed.orders.push({
    id: 'es_order_1001',
    orderNumber: 'AL-1001',
    customerId: 'cust_sales_memory',
    platform: 'easystore',
    status: 'paid',
    updatedAt: '2026-06-03T06:00:00.000Z',
    shippingAddress: {
      recipientPhone: '0812345678',
      formattedAddress: '99/1 ถนนสุขุมวิท แขวงคลองตัน เขตคลองเตย กรุงเทพมหานคร 10110',
      district: 'คลองเตย',
      province: 'กรุงเทพมหานคร',
      postalCode: '10110',
    },
    itemSummary: [{ sellerSku: 'LORRA-BLK-XL', productName: 'Lorra เดรสเชิ้ต Polo สีดำ XL' }],
  })
  const service = createOmniService(seed)

  const context = service.resolveSalesContext({ threadId: 'thread_sales_memory' })

  assert.equal(context.ok, true)
  assert.equal(context.customer.match.safeToUsePrivateData, true)
  assert.equal(context.customer.memory.phoneLast4, '5678')
  assert.equal(context.customer.memory.phoneMasked, '081***5678')
  assert.notEqual(context.customer.memory.phoneHash, '')
  assert.equal(context.customer.memory.lastOrderNumber, 'AL-1001')
  assert.equal(context.customer.memory.lastSize, 'XL')
  assert.equal(context.customer.memory.lastColor, 'ดำ')
  assert.match(context.customer.memory.lastAddressMasked, /คลองเตย/)
  assert.doesNotMatch(JSON.stringify(context.customer), /0812345678/)
  assert.doesNotMatch(JSON.stringify(context.customer), /สุขุมวิท/)
})

test('sales context resolver does not expose private memory from name-only match', () => {
  const seed = createOmniSeed()
  seed.customers.push({ id: 'cust_name_only', displayName: 'Facebook Customer', matchConfidence: 0.3 })
  seed.threads.push({
    id: 'thread_name_only',
    pageId: 'page_annalynn',
    platform: 'facebook',
    customerId: 'cust_name_only',
    status: 'open',
    intent: 'stock',
    risk: 'low',
    updatedAt: '2026-06-04T06:10:00.000Z',
  })
  seed.orders.push({
    id: 'es_order_name_only',
    orderNumber: 'AL-1002',
    customerId: 'es_customer_2',
    customerName: 'Facebook Customer',
    platform: 'easystore',
    status: 'paid',
    updatedAt: '2026-06-03T06:10:00.000Z',
    shippingAddress: {
      recipientPhone: '0899999999',
      formattedAddress: '88/8 ถนนพระรามสอง กรุงเทพมหานคร 10150',
      province: 'กรุงเทพมหานคร',
      postalCode: '10150',
    },
    itemSummary: [{ sellerSku: 'LORRA-BLK-M', productName: 'Lorra สีดำ M' }],
  })
  const service = createOmniService(seed)

  const context = service.resolveSalesContext({ threadId: 'thread_name_only' })

  assert.equal(context.ok, true)
  assert.equal(context.customer.match.safeToUsePrivateData, false)
  assert.deepEqual(context.customer.match.basis, ['name_only'])
  assert.equal(context.customer.memory.phoneMasked, '')
  assert.equal(context.customer.memory.phoneLast4, '')
  assert.equal(context.customer.memory.phoneHash, '')
  assert.equal(context.customer.memory.lastAddressMasked, '')
  assert.equal(context.customer.memory.lastOrderNumber, null)
  assert.doesNotMatch(JSON.stringify(context.customer), /0899999999/)
  assert.doesNotMatch(JSON.stringify(context.customer), /พระรามสอง/)
})

test('sales context resolver picks EasyStore product variants and image candidates', () => {
  const seed = createOmniSeed()
  seed.customers.push({ id: 'cust_lorra_context', displayName: 'Lorra Customer', matchConfidence: 1 })
  seed.threads.push({
    id: 'thread_lorra_context',
    pageId: 'page_annalynn',
    platform: 'facebook',
    customerId: 'cust_lorra_context',
    status: 'open',
    intent: 'stock',
    risk: 'low',
    updatedAt: '2026-06-04T06:20:00.000Z',
    originContext: { channel: 'facebook', sourceType: 'post', productHint: { text: 'Lorra', color: 'ดำ', size: 'XL' } },
  })
  seed.messages.push({
    id: 'msg_lorra_context',
    threadId: 'thread_lorra_context',
    direction: 'inbound',
    authorName: 'Lorra Customer',
    text: 'ขอรูป Lorra สีดำ XL',
    createdAt: '2026-06-04T06:20:00.000Z',
  })
  seed.messages.push({
    id: 'msg_lorra_old_image',
    threadId: 'thread_lorra_context',
    direction: 'outbound',
    authorName: 'Anna Lynn AI',
    text: 'รูปเดิมค่ะ',
    attachments: [{ type: 'image', url: 'https://cdn.example/lorra-main.jpg' }],
    createdAt: '2026-06-04T06:21:00.000Z',
  })
  seed.inventorySnapshots.push(
    { id: 'es_stock_lorra_black_xl', sku: 'LORRA-BLK-XL', source: 'easystore', available: 7, checkedAt: '2026-06-04T06:00:00.000Z', productId: '16462646', variantId: '7601', productName: 'Lorra เดรสเชิ้ต Polo สีดำ', price: 1290 },
    { id: 'es_stock_lorra_black_m', sku: 'LORRA-BLK-M', source: 'easystore', available: 3, checkedAt: '2026-06-04T06:00:00.000Z', productId: '16462646', variantId: '7602', productName: 'Lorra เดรสเชิ้ต Polo สีดำ', price: 1290 },
    { id: 'es_stock_amanda_black_xl', sku: 'AMANDA-BLK-XL', source: 'easystore', available: 5, checkedAt: '2026-06-04T06:00:00.000Z', productId: '16460000', variantId: '9901', productName: 'Amanda Jumpsuit สีดำ', price: 1490 },
  )
  const service = createOmniService(seed)

  const context = service.resolveSalesContext({
    threadId: 'thread_lorra_context',
    productPreview: {
      ok: true,
      product: {
        id: '16462646',
        title: 'Lorra เดรสเชิ้ต Polo',
        images: [
          { id: 'main', url: 'https://cdn.example/lorra-main.jpg', alt: 'Lorra สีดำ' },
          { id: 'cream', url: 'https://cdn.example/lorra-cream.jpg', alt: 'Lorra สีครีม' },
        ],
        variants: [
          { id: '7601', sku: 'LORRA-BLK-XL', title: 'ดำ / XL', imageUrl: 'https://cdn.example/lorra-black-xl.jpg' },
          { id: '7602', sku: 'LORRA-BLK-M', title: 'ดำ / M', imageUrl: 'https://cdn.example/lorra-black-m.jpg' },
        ],
      },
    },
  })

  assert.equal(context.ok, true)
  assert.equal(context.product.product.productId, '16462646')
  assert.equal(context.product.variants[0].sku, 'LORRA-BLK-XL')
  assert.equal(context.product.variants[0].available, 7)
  assert.equal(context.product.sourceIds.includes('es_stock_lorra_black_xl'), true)
  assert.equal(context.imagePicker.source, 'easystore_preview')
  assert.equal(context.imagePicker.images[0].url, 'https://cdn.example/lorra-black-xl.jpg')
  assert.equal(new Set(context.imagePicker.images.map((image) => image.url)).size, context.imagePicker.images.length)
})

test('omni routes are mounted under api', async () => {
  const app = express()
  app.use(express.json())
  mountRoutes(app, { broadcast() {} }, { snapshot() { return {} } })

  const server = app.listen(0)
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`
    const response = await fetch(`${baseUrl}/api/omni/pages`)
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.equal(body.ok, true)
    assert.equal(body.pages.length, 7)
  } finally {
    server.close()
  }
})

test('knowledge source routes persist searchable training sources', async () => {
  const app = express()
  app.use(express.json())
  mountRoutes(app, { broadcast() {} }, { snapshot() { return {} } })

  const server = app.listen(0)
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`
    const createResponse = await fetch(`${baseUrl}/api/omni/knowledge-sources`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Test stock answer',
        content: 'ตอบลูกค้าว่าสินค้ามีพร้อมส่งหลังเช็กคลัง',
        tags: ['stock', 'test'],
      }),
    })
    const created = await createResponse.json()
    assert.equal(createResponse.status, 200)
    assert.equal(created.ok, true)
    assert.equal(created.source.status, 'ready')

    const searchResponse = await fetch(`${baseUrl}/api/omni/knowledge-sources?q=stock`)
    const search = await searchResponse.json()
    assert.equal(search.ok, true)
    assert.equal(search.sources.some((source) => source.id === created.source.id), true)

    const updateResponse = await fetch(`${baseUrl}/api/omni/knowledge-sources`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: created.source.id,
        title: 'Test stock answer updated',
        content: 'อัปเดตแล้ว ใช้รายการเดิม ไม่สร้างซ้ำ',
        tags: ['stock', 'test'],
      }),
    })
    const updated = await updateResponse.json()
    assert.equal(updateResponse.status, 200)
    assert.equal(updated.source.id, created.source.id)
    assert.equal(updated.snapshot.knowledgeSources.filter((source) => source.id === created.source.id).length, 1)

    const deleteResponse = await fetch(`${baseUrl}/api/omni/knowledge-sources/${created.source.id}`, { method: 'DELETE' })
    const deleted = await deleteResponse.json()
    assert.equal(deleteResponse.status, 200)
    assert.equal(deleted.deletedId, created.source.id)
  } finally {
    server.close()
  }
})

test('AI reply engine prioritizes Boss sales workflow knowledge when it matches product questions', async () => {
  const seed = createOmniSeed()
  seed.knowledgeSources.push({
    id: 'ks_annalynn_sales_workflow_v1',
    workspaceId: 'ws_oagent',
    title: 'Anna Lynn sales workflow Q&A - Boss approved v1',
    type: 'faq',
    scope: 'page_annalynn',
    status: 'ready',
    content: 'ระบบต้องเป็น workflow/funnel ใช้ EasyStore เช็กสินค้า stock price image payment ห้ามถามซ้ำ และต้องจบด้วย action ถัดไป',
    tags: ['annalynn', 'faq', 'sales', 'product', 'stock', 'price', 'image', 'payment', 'easystore', 'workflow'],
    updatedAt: '2026-06-05T05:01:55.246Z',
    createdAt: '2026-06-05T04:57:24.633Z',
  })
  seed.customers.push({ id: 'cust_sales_workflow', displayName: 'Sales Customer', matchConfidence: 1 })
  seed.threads.push({
    id: 'thread_sales_workflow',
    pageId: 'page_annalynn',
    platform: 'facebook',
    customerId: 'cust_sales_workflow',
    status: 'open',
    intent: 'unknown',
    risk: 'low',
    unreadCount: 1,
    messageCount: 1,
    updatedAt: '2026-06-05T05:05:00.000Z',
  })
  seed.messages.push({
    id: 'msg_sales_workflow',
    threadId: 'thread_sales_workflow',
    direction: 'inbound',
    authorName: 'Sales Customer',
    text: 'Lorra ดำ XL มีของไหม ราคาเท่าไหร่ ขอรูปด้วย',
    createdAt: '2026-06-05T05:05:00.000Z',
  })
  seed.inventorySnapshots.push({
    id: 'es_stock_lorra_black_xl_sales',
    sku: 'LORRA-BLK-XL',
    source: 'easystore',
    available: 2,
    checkedAt: '2026-06-05T05:04:00.000Z',
    productId: '16462646',
    variantId: '7601',
    productName: 'Lorra เดรสเชิ้ต Polo',
    price: 1290,
    imageUrl: 'https://cdn.example/lorra-black-xl.jpg',
  })
  const service = createOmniService(seed)
  const thread = service.getThread('thread_sales_workflow')
  const ai = createAiReplyEngine({ provider: 'local_rules', model: 'test' })
  const decision = await ai.draft({ thread, snapshot: service.snapshot(), policy: service.getPolicyForThread(thread) })

  assert.equal(decision.ok, true)
  assert.equal(decision.sourceIds.includes('ks_annalynn_sales_workflow_v1'), true)
})

test('AI reply engine adds rich message campaign brief to the first customer reply only', async () => {
  const seed = createOmniSeed()
  seed.omniSettings[0].settings.ai.richMessage = {
    enabled: true,
    text: '6.6 ออกตัวแรงลดยกล้อ',
  }
  seed.customers.push({ id: 'cust_rich_campaign', displayName: 'Campaign Customer', matchConfidence: 1 })
  seed.threads.push({
    id: 'thread_rich_campaign',
    pageId: 'page_annalynn',
    platform: 'facebook_comment',
    customerId: 'cust_rich_campaign',
    status: 'open',
    intent: 'unknown',
    risk: 'low',
    unreadCount: 1,
    messageCount: 1,
    updatedAt: '2026-06-05T05:05:00.000Z',
  })
  seed.messages.push({
    id: 'msg_rich_campaign',
    threadId: 'thread_rich_campaign',
    direction: 'inbound',
    authorName: 'Campaign Customer',
    text: 'ราคาเท่าไหร่',
    createdAt: '2026-06-05T05:05:00.000Z',
  })
  const service = createOmniService(seed)
  const thread = service.getThread('thread_rich_campaign')
  const ai = createAiReplyEngine({ provider: 'local_rules', model: 'test' })
  const snapshot = service.snapshot()
  snapshot.settings = service.getSettingsForThread(thread.id)

  const firstDecision = await ai.draft({ thread, snapshot, policy: service.getPolicyForThread(thread) })

  assert.match(firstDecision.draftText, /6\.6 ออกตัวแรงลดยกล้อ/)

  snapshot.messages.push({
    id: 'msg_rich_campaign_outbound',
    threadId: 'thread_rich_campaign',
    direction: 'outbound',
    authorName: 'Anna Lynn AI',
    text: firstDecision.draftText,
    createdAt: '2026-06-05T05:05:05.000Z',
  })
  const secondDecision = await ai.draft({ thread, snapshot, policy: service.getPolicyForThread(thread) })

  assert.doesNotMatch(secondDecision.draftText, /6\.6 ออกตัวแรงลดยกล้อ/)
})

test('AI reply engine prepares bill link and product carousel assets for checkout-ready replies', async () => {
  const seed = createOmniSeed()
  seed.omniSettings[0].settings.ai.salesAssets = {
    enabled: true,
    sizeChartImageUrl: 'https://cdn.example/lorra-size-chart.jpg',
  }
  seed.customers.push({ id: 'cust_checkout_assets', displayName: 'Checkout Customer', matchConfidence: 1 })
  seed.threads.push({
    id: 'thread_checkout_assets',
    pageId: 'page_annalynn',
    platform: 'facebook',
    customerId: 'cust_checkout_assets',
    status: 'open',
    intent: 'unknown',
    risk: 'low',
    unreadCount: 1,
    messageCount: 1,
    updatedAt: '2026-06-05T05:05:00.000Z',
  })
  seed.messages.push({
    id: 'msg_checkout_assets',
    threadId: 'thread_checkout_assets',
    direction: 'inbound',
    authorName: 'Checkout Customer',
    text: 'Lorra ดำ XL เอาค่ะ',
    createdAt: '2026-06-05T05:05:00.000Z',
  })
  seed.inventorySnapshots.push(
    {
      id: 'es_stock_lorra_black_xl_checkout',
      sku: 'LORRA-BLK-XL',
      source: 'easystore',
      available: 2,
      checkedAt: '2026-06-05T05:04:00.000Z',
      productId: '16462646',
      variantId: '7601',
      productName: 'Lorra เดรสเชิ้ต Polo',
      price: 1290,
      imageUrl: 'https://cdn.example/lorra-black-xl.jpg',
    },
    {
      id: 'es_stock_lorra_gray_xl_checkout',
      sku: 'LORRA-GRY-XL',
      source: 'easystore',
      available: 1,
      checkedAt: '2026-06-05T05:04:00.000Z',
      productId: '16462646',
      variantId: '7602',
      productName: 'Lorra เดรสเชิ้ต Polo',
      price: 1290,
      imageUrl: 'https://cdn.example/lorra-gray-xl.jpg',
    },
  )
  seed.paymentRequests.push({
    id: 'pay_checkout_assets',
    threadId: 'thread_checkout_assets',
    orderId: null,
    provider: 'meta_pay_kgp',
    status: 'pending',
    amount: 1290,
    currency: 'THB',
    approvalRequired: true,
    checkoutUrl: 'https://pay.example/checkout/lorra-xl',
    messagePreview: 'ชำระเงิน Lorra XL: https://pay.example/checkout/lorra-xl',
    createdAt: '2026-06-05T05:04:30.000Z',
  })
  const service = createOmniService(seed)
  const thread = service.getThread('thread_checkout_assets')
  const snapshot = service.snapshot()
  snapshot.settings = service.getSettingsForThread(thread.id)
  const ai = createAiReplyEngine({ provider: 'local_rules', model: 'test' })

  const decision = await ai.draft({ thread, snapshot, policy: service.getPolicyForThread(thread) })

  assert.equal(decision.ok, true)
  assert.match(decision.draftText, /https:\/\/pay\.example\/checkout\/lorra-xl/)
  assert.equal(decision.attachments.some((item) => item.url === 'https://cdn.example/lorra-black-xl.jpg'), true)
  assert.equal(decision.attachments.some((item) => item.url === 'https://cdn.example/lorra-size-chart.jpg'), true)
  assert.equal(decision.carousel.some((card) => card.imageUrl === 'https://cdn.example/lorra-gray-xl.jpg'), true)
})

test('Meta auto reply records AI carousel assets as visible guarded draft attachments', async () => {
  const service = createOmniService()
  const app = express()
  app.use(express.json())
  const hub = { broadcast() {} }
  const room = { addMessage: (message) => ({ id: 'room_msg_1', ...message }), snapshot: () => ({}) }
  const ai = {
    draft: async ({ thread }) => ({
      ok: true,
      provider: 'local_rules',
      model: 'test',
      threadId: thread.id,
      intent: 'productImage',
      risk: 'low',
      action: 'draft_ready',
      confidence: 0.9,
      allowed: true,
      draftText: 'ส่งภาพสินค้าและตารางไซซ์ให้ดูค่ะ ชำระเงินได้ที่ https://pay.example/order-1',
      reason: 'test_assets_ready',
      sourceIds: [],
      evidenceIds: [],
      attachments: [
        { id: 'ai_product_image_1', name: 'ภาพสีดำ', type: 'image/jpeg', size: 0, url: 'https://cdn.example/black.jpg' },
        { id: 'ai_size_chart_1', name: 'ตารางไซซ์', type: 'image/jpeg', size: 0, url: 'https://cdn.example/size-chart.jpg' },
      ],
      carousel: [
        { title: 'ภาพสีดำ', imageUrl: 'https://cdn.example/black.jpg' },
        { title: 'ตารางไซซ์', imageUrl: 'https://cdn.example/size-chart.jpg' },
      ],
    }),
  }
  mountWebhook(app, hub, room, {
    omni: service,
    ai,
    awaitAutoReplies: true,
    metaAutoReplyDefault: true,
    metaAutoSendDefault: false,
    followUpEnabled: false,
  })
  const server = app.listen(0)
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`
    const response = await fetch(`${baseUrl}/webhook/meta?autoReply=1&send=0`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        object: 'page',
        entry: [{
          id: '122106446570001676',
          messaging: [{
            sender: { id: 'customer_assets_1' },
            recipient: { id: '122106446570001676' },
            timestamp: 1779470000000,
            message: { mid: 'mid_assets_1', text: 'ขอดูรูปและบิลค่ะ' },
          }],
        }],
      }),
    })
    const payload = await response.json()
    const draft = payload.result.autoReplies[0].draft

    assert.equal(response.status, 200)
    assert.equal(payload.result.autoReplies[0].sendSkipped, 'draft_only')
    assert.equal(draft.attachments.length, 2)
    assert.equal(draft.attachments.some((item) => item.url === 'https://cdn.example/size-chart.jpg'), true)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('retention route dry-runs chat cleanup by default', async () => {
  const seed = createOmniSeed()
  seed.messages = [
    { id: 'msg_route_old', threadId: 'thread_1', direction: 'inbound', authorName: 'ลูกค้า A', text: 'เก่ามาก', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'msg_route_new', threadId: 'thread_1', direction: 'inbound', authorName: 'ลูกค้า A', text: 'ใหม่', createdAt: '2026-05-23T00:00:00.000Z' },
  ]
  seed.threads = seed.threads.map((thread) => thread.id === 'thread_1' ? { ...thread, messageCount: 2, unreadCount: 2 } : thread)
  const app = express()
  app.use(express.json())
  const service = createOmniService(seed)
  mountRoutes(app, { broadcast() {} }, { snapshot() { return {} } }, { omni: service })

  const server = app.listen(0)
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`
    const response = await fetch(`${baseUrl}/api/omni/retention/chat-messages/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        deleteAfterDays: 30,
        now: '2026-05-24T00:00:00.000Z',
      }),
    })
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.equal(body.ok, true)
    assert.equal(body.dryRun, true)
    assert.equal(body.counts.messagesDeleted, 1)
    assert.equal(service.getThread('thread_1').messages.length, 2)
  } finally {
    server.close()
  }
})

test('Omni history clear dry-run reports counts without deleting runtime history', () => {
  const seed = createOmniSeed()
  seed.approvalTasks = [{ id: 'approval_1', status: 'pending' }]
  const service = createOmniService(seed)

  const result = service.clearHistory({ dryRun: true })

  assert.equal(result.ok, true)
  assert.equal(result.dryRun, true)
  assert.equal(result.counts.threads, seed.threads.length)
  assert.equal(result.counts.messages, seed.messages.length)
  assert.equal(result.counts.customers, seed.customers.length)
  assert.equal(result.counts.approvalTasks, 1)
  assert.equal(service.snapshot().threads.length, seed.threads.length)
  assert.equal(service.snapshot().messages.length, seed.messages.length)
  assert.equal(service.snapshot().knowledgeSources.length, seed.knowledgeSources.length)
})

test('Omni history clear requires confirmation and preserves system config', () => {
  const seed = createOmniSeed()
  seed.approvalTasks = [{ id: 'approval_1', status: 'pending' }]
  const service = createOmniService(seed)

  const blocked = service.clearHistory({ dryRun: false })
  assert.equal(blocked.ok, false)
  assert.equal(blocked.error, 'confirmation_required')
  assert.equal(service.snapshot().threads.length, seed.threads.length)

  const cleared = service.clearHistory({
    dryRun: false,
    confirmClearHistory: 'CLEAR_OMNI_HISTORY',
    actorId: 'boss',
  })
  const snapshot = service.snapshot()

  assert.equal(cleared.ok, true)
  assert.equal(cleared.dryRun, false)
  assert.equal(cleared.counts.threads, seed.threads.length)
  assert.equal(snapshot.threads.length, 0)
  assert.equal(snapshot.messages.length, 0)
  assert.equal(snapshot.customers.length, 0)
  assert.equal(snapshot.orders.length, 0)
  assert.equal(snapshot.paymentRequests.length, 0)
  assert.equal(snapshot.aiDecisions.length, 0)
  assert.equal(snapshot.approvalTasks.length, 0)
  assert.equal(snapshot.pages.length, seed.pages.length)
  assert.equal(snapshot.policySets.length, seed.policySets.length)
  assert.equal(snapshot.omniSettings.length, seed.omniSettings.length)
  assert.equal(snapshot.knowledgeSources.length, seed.knowledgeSources.length)
  assert.equal(snapshot.actionAudits.length, 1)
  assert.equal(snapshot.actionAudits[0].action, 'omni_history_cleared')
})

test('Omni history clear route dry-runs by default and applies with confirmation', async () => {
  const app = express()
  app.use(express.json())
  const service = createOmniService()
  mountRoutes(app, { broadcast() {} }, { snapshot() { return {} } }, { omni: service })

  const server = app.listen(0)
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`
    const dryRunResponse = await fetch(`${baseUrl}/api/omni/history/clear`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    const dryRunBody = await dryRunResponse.json()
    assert.equal(dryRunResponse.status, 200)
    assert.equal(dryRunBody.ok, true)
    assert.equal(dryRunBody.dryRun, true)
    assert.equal(service.snapshot().threads.length > 0, true)

    const blockedResponse = await fetch(`${baseUrl}/api/omni/history/clear`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dryRun: false }),
    })
    const blockedBody = await blockedResponse.json()
    assert.equal(blockedResponse.status, 400)
    assert.equal(blockedBody.error, 'confirmation_required')

    const applyResponse = await fetch(`${baseUrl}/api/omni/history/clear`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dryRun: false, confirmClearHistory: 'CLEAR_OMNI_HISTORY' }),
    })
    const applyBody = await applyResponse.json()
    assert.equal(applyResponse.status, 200)
    assert.equal(applyBody.ok, true)
    assert.equal(applyBody.dryRun, false)
    assert.equal(service.snapshot().threads.length, 0)
    assert.equal(service.snapshot().messages.length, 0)
  } finally {
    server.close()
  }
})

test('Facebook route rejects unknown page profile without mutation', async () => {
  const app = express()
  app.use(express.json())
  mountRoutes(app, { broadcast() {} }, { snapshot() { return {} } })

  const server = app.listen(0)
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`
    const response = await fetch(`${baseUrl}/api/omni/facebook/conversations?page=unknown_page`)
    const body = await response.json()

    assert.equal(response.status, 400)
    assert.equal(body.ok, false)
    assert.match(body.error, /unknown_facebook_page/)
  } finally {
    server.close()
  }
})

test('Facebook sync route rejects unknown page profile without mutation', async () => {
  const app = express()
  app.use(express.json())
  mountRoutes(app, { broadcast() {} }, { snapshot() { return {} } })

  const server = app.listen(0)
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`
    const response = await fetch(`${baseUrl}/api/omni/facebook/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ page: 'unknown_page' }),
    })
    const body = await response.json()

    assert.equal(response.status, 400)
    assert.equal(body.ok, false)
    assert.match(body.error, /unknown_facebook_page/)
  } finally {
    server.close()
  }
})

test('omni schema route exposes read-only database contract', async () => {
  const app = express()
  app.use(express.json())
  mountRoutes(app, { broadcast() {} }, { snapshot() { return {} } })

  const server = app.listen(0)
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`
    const response = await fetch(`${baseUrl}/api/omni/schema`)
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.equal(body.ok, true)
    assert.equal(body.schema.tableCount, REQUIRED_OMNI_TABLES.length)
    assert.equal(body.schema.hasPaymentApprovalGuard, true)
  } finally {
    server.close()
  }
})

test('normalizes Meta conversations into Omni threads and customers', () => {
  const normalized = normalizeMetaConversations({
    pageProfile: 'man_kynd',
    response: {
      data: [{
        id: 't_123',
        updated_time: '2026-05-22T06:46:10+0000',
        link: '/189971841184132/inbox/abc/?section=messages',
        unread_count: 3,
        message_count: 4,
        snippet: 'สวัสดีครับ',
        senders: { data: [
          { id: 'customer_1', name: 'Customer One' },
          { id: '189971841184132', name: 'MAN KYND' },
        ] },
      }],
    },
  })

  assert.equal(normalized.page.omniPageId, 'page_mankynd')
  assert.equal(normalized.threads[0].id, 'fb_t_123')
  assert.equal(normalized.threads[0].customerId, 'fb_customer_customer_1')
  assert.equal(normalized.threads[0].status, 'open')
  assert.equal(normalized.customers[0].displayName, 'Customer One')
  assert.equal(normalized.messages[0].text, 'สวัสดีครับ')
})

test('Facebook connector calls meta helper through injectable runner', async () => {
  const calls = []
  const result = await listFacebookConversations({
    pageProfile: 'page_des',
    runner: async (args) => {
      calls.push(args)
      return { ok: true, response: { data: [] } }
    },
  })

  assert.deepEqual(calls[0], ['list-conversations', '--page=page_des'])
  assert.equal(result.page.omniPageId, 'page_des')
  assert.deepEqual(result.threads, [])
})

test('Meta social live sources attempts live comments before fallback with blocker evidence', async () => {
  const calls = []
  const social = createMetaSocialRuntime({
    runner: async (args) => {
      calls.push(args)
      if (args[0] === 'list-live-comments') throw new Error('meta_live_comments_permission_missing')
      if (args[0] === 'list-posts') {
        return {
          ok: true,
          page_id: 'page_1',
          response: { data: [{ id: 'post_1', message: 'fallback post', comment_count: 2 }] },
        }
      }
      throw new Error(`unexpected:${args[0]}`)
    },
  })

  const result = await social.listLiveCommentSources({ pageProfile: 'man_kynd', limit: 3 })

  assert.equal(result.ok, true)
  assert.equal(result.mode, 'fallback_live_post_comment_capture')
  assert.equal(result.blocker, 'meta_live_comments_permission_missing')
  assert.equal(result.blockerEvidence.command, 'list-live-comments')
  assert.equal(result.posts[0].id, 'post_1')
  assert.deepEqual(calls.map((args) => args[0]), ['list-live-comments', 'list-posts'])
})

test('Meta social runtime uses Graph API for posts and comments when helper is not configured', async () => {
  const originalFetch = globalThis.fetch
  const savedHelper = process.env.META_INBOX_HELPER
  const savedManKyndToken = process.env.META_PAGE_TOKEN_MAN_KYND
  const calls = []
  globalThis.fetch = async (url) => {
    calls.push(url.toString())
    if (url.toString().includes('/189971841184132/posts')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          data: [{
            id: 'post_direct_1',
            message: 'เปิดขาย BLACK-M',
            created_time: '2026-06-02T03:00:00+0000',
            permalink_url: 'https://facebook.com/post_direct_1',
            comments: {
              summary: { total_count: 1 },
              data: [{ id: 'comment_preview_1', message: 'รับ BLACK-M', created_time: '2026-06-02T03:01:00+0000' }],
            },
          }],
          paging: { next: 'next-page' },
        }),
      }
    }
    if (url.toString().includes('/post_direct_1/comments')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          data: [{ id: 'comment_direct_1', message: 'CF BLACK-M x2', comment_count: 0, like_count: 3 }],
          summary: { total_count: 1 },
        }),
      }
    }
    throw new Error(`unexpected fetch ${url}`)
  }

  try {
    delete process.env.META_INBOX_HELPER
    process.env.META_PAGE_TOKEN_MAN_KYND = 'test_mankynd_page_token'
    const social = createMetaSocialRuntime()

    const posts = await social.listPagePosts({ pageProfile: 'man_kynd', limit: 2 })
    assert.equal(posts.ok, true)
    assert.equal(posts.pageId, '189971841184132')
    assert.equal(posts.posts[0].id, 'post_direct_1')
    assert.equal(posts.posts[0].commentCount, 1)
    assert.equal(posts.posts[0].commentsPreview[0].id, 'comment_preview_1')

    const comments = await social.listPostComments({ objectId: 'post_direct_1', pageProfile: 'man_kynd', limit: 5 })
    assert.equal(comments.ok, true)
    assert.equal(comments.comments[0].id, 'comment_direct_1')
    assert.equal(comments.comments[0].likeCount, 3)
    assert.equal(calls.length, 2)
    assert.match(calls[0], /graph\.facebook\.com/)
    assert.match(calls[0], /access_token=test_mankynd_page_token/)
    assert.match(calls[0], /limit=2/)
    assert.match(calls[1], /post_direct_1%2Fcomments|post_direct_1\/comments/)
    assert.match(calls[1], /limit=5/)
  } finally {
    if (savedHelper === undefined) delete process.env.META_INBOX_HELPER
    else process.env.META_INBOX_HELPER = savedHelper
    if (savedManKyndToken === undefined) delete process.env.META_PAGE_TOKEN_MAN_KYND
    else process.env.META_PAGE_TOKEN_MAN_KYND = savedManKyndToken
    globalThis.fetch = originalFetch
  }
})

test('Meta social runtime reports token missing instead of spawning local helper in cloud mode', async () => {
  const savedHelper = process.env.META_INBOX_HELPER
  const savedManKyndToken = process.env.META_PAGE_TOKEN_MAN_KYND
  const savedFallbackToken = process.env.META_PAGE_ACCESS_TOKEN
  try {
    delete process.env.META_INBOX_HELPER
    delete process.env.META_PAGE_TOKEN_MAN_KYND
    delete process.env.META_PAGE_ACCESS_TOKEN

    const social = createMetaSocialRuntime()
    await assert.rejects(
      social.listPagePosts({ pageProfile: 'man_kynd', limit: 1 }),
      /meta_page_token_missing/,
    )
  } finally {
    if (savedHelper === undefined) delete process.env.META_INBOX_HELPER
    else process.env.META_INBOX_HELPER = savedHelper
    if (savedManKyndToken === undefined) delete process.env.META_PAGE_TOKEN_MAN_KYND
    else process.env.META_PAGE_TOKEN_MAN_KYND = savedManKyndToken
    if (savedFallbackToken === undefined) delete process.env.META_PAGE_ACCESS_TOKEN
    else process.env.META_PAGE_ACCESS_TOKEN = savedFallbackToken
  }
})

test('Facebook connector accepts configured extra page profile', async () => {
  const result = await listFacebookConversations({
    pageProfile: 'fb_112154661515664',
    runner: async () => ({ ok: true, response: { data: [] } }),
  })

  assert.equal(result.page.pageId, '112154661515664')
  assert.equal(result.page.omniPageId, 'page_fb_112154661515664')
})

test('page registry merges file profiles with fallback profiles', () => {
  const dir = mkdtempSync(join(tmpdir(), 'omni-pages-'))
  const registryPath = join(dir, 'pages.json')
  writeFileSync(registryPath, JSON.stringify([{
    profileKey: 'fb_extra_page',
    pageId: '999999999',
    pageName: 'Extra Page',
    omniPageId: 'page_extra',
    platform: 'facebook',
  }]))

  const registry = loadPageRegistry({ registryPath })

  assert.equal(registry.anna_lynn.omniPageId, 'page_annalynn')
  assert.equal(registry.ig_anna_lynn.pageId, '17841456216401165')
  assert.equal(registry.ig_man_kynd.pageId, '17841402222436331')
  assert.equal(registry.ig_page_des.pageId, 'NOT_LINKED')
  assert.equal(registry.ig_fb_112154661515664.pageId, '17841462136286560')
  assert.equal(registry.fb_extra_page.omniPageId, 'page_extra')
})

test('Facebook reply connector skips send when meta helper binary is unavailable', async () => {
  const helperPath = join(mkdtempSync(join(tmpdir(), 'meta-helper-missing-')), 'meta-inbox-api')
  const result = await sendFacebookReply({
    pageProfile: 'anna_lynn',
    recipientId: 'recipient_123',
    message: 'ทัก inbox ได้เลยค่ะ',
    helperPath,
  })

  assert.equal(result.ok, false)
  assert.equal(result.error, 'helper_not_available')
  assert.equal(result.helperPath, helperPath)
})

test('Facebook reply connector sends text and image attachments through direct Graph API', async () => {
  const savedToken = process.env.META_PAGE_TOKEN_ANNA_LYNN
  const calls = []
  try {
    process.env.META_PAGE_TOKEN_ANNA_LYNN = 'test_anna_page_token'
    const result = await sendFacebookReply({
      pageProfile: 'anna_lynn',
      recipientId: 'psid_123',
      message: 'ส่งภาพสินค้าให้ดูค่ะ',
      attachments: [{
        id: 'img_1',
        name: 'black-m.jpg',
        type: 'image/jpeg',
        url: 'https://cdn.example.com/black-m.jpg',
      }],
      fetchImpl: async (url, options) => {
        calls.push({ url: url.toString(), body: JSON.parse(options.body) })
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ message_id: `mid_${calls.length}` }),
        }
      },
    })

    assert.equal(result.ok, true)
    assert.equal(calls.length, 2)
    assert.equal(calls[0].body.messaging_type, 'RESPONSE')
    assert.deepEqual(calls[0].body.message, { text: 'ส่งภาพสินค้าให้ดูค่ะ' })
    assert.deepEqual(calls[1].body.message, {
      attachment: {
        type: 'image',
        payload: {
          url: 'https://cdn.example.com/black-m.jpg',
          is_reusable: true,
        },
      },
    })
  } finally {
    if (savedToken === undefined) delete process.env.META_PAGE_TOKEN_ANNA_LYNN
    else process.env.META_PAGE_TOKEN_ANNA_LYNN = savedToken
  }
})

test('Facebook reply connector sends generic template carousel through direct Graph API', async () => {
  const savedToken = process.env.META_PAGE_TOKEN_ANNA_LYNN
  const calls = []
  try {
    process.env.META_PAGE_TOKEN_ANNA_LYNN = 'test_anna_page_token'
    const result = await sendFacebookReply({
      pageProfile: 'anna_lynn',
      recipientId: 'psid_carousel',
      carousel: [{
        title: 'Lorra สีดำ XL',
        subtitle: 'พร้อมส่ง 5 ชิ้น',
        imageUrl: 'https://cdn.example.com/lorra-black-xl.jpg',
        buttons: [{ type: 'web_url', title: 'ดูสินค้า', url: 'https://annalynna.easy.co/products/lorra-black-xl' }],
      }, {
        title: 'Lorra สีดำ M',
        subtitle: 'พร้อมส่ง 3 ชิ้น',
        image_url: 'https://cdn.example.com/lorra-black-m.jpg',
      }],
      fetchImpl: async (url, options) => {
        calls.push({ url: url.toString(), body: JSON.parse(options.body) })
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ message_id: `mid_${calls.length}` }),
        }
      },
    })

    assert.equal(result.ok, true)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].body.messaging_type, 'RESPONSE')
    assert.deepEqual(calls[0].body.message, {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'generic',
          elements: [{
            title: 'Lorra สีดำ XL',
            subtitle: 'พร้อมส่ง 5 ชิ้น',
            image_url: 'https://cdn.example.com/lorra-black-xl.jpg',
            buttons: [{ type: 'web_url', title: 'ดูสินค้า', url: 'https://annalynna.easy.co/products/lorra-black-xl' }],
          }, {
            title: 'Lorra สีดำ M',
            subtitle: 'พร้อมส่ง 3 ชิ้น',
            image_url: 'https://cdn.example.com/lorra-black-m.jpg',
          }],
        },
      },
    })
  } finally {
    if (savedToken === undefined) delete process.env.META_PAGE_TOKEN_ANNA_LYNN
    else process.env.META_PAGE_TOKEN_ANNA_LYNN = savedToken
  }
})

test('Facebook comment connector skips send when meta helper binary is unavailable', async () => {
  const helperPath = join(mkdtempSync(join(tmpdir(), 'meta-helper-missing-')), 'meta-inbox-api')
  const result = await sendFacebookCommentReply({
    pageProfile: 'anna_lynn',
    commentId: 'comment_123',
    message: 'ทัก inbox ได้เลยค่ะ',
    helperPath,
  })

  assert.equal(result.ok, false)
  assert.equal(result.error, 'helper_not_available')
  assert.equal(result.helperPath, helperPath)
})

test('Facebook comment connector calls meta helper through injectable runner', async () => {
  const calls = []
  const result = await sendFacebookCommentReply({
    pageProfile: 'anna_lynn',
    commentId: 'comment_123',
    message: 'ทัก inbox ได้เลยค่ะ',
    runner: async (args) => {
      calls.push(args)
      return { ok: true, response: { id: 'reply_123' } }
    },
  })

  assert.deepEqual(calls[0], ['reply-comment', '--page=anna_lynn', '--comment-id=comment_123', '--message=ทัก inbox ได้เลยค่ะ', '--approved'])
  assert.equal(result.response.id, 'reply_123')
})

test('Instagram comment connector calls meta helper through injectable runner', async () => {
  const calls = []
  const result = await sendInstagramCommentReply({
    pageProfile: 'ig_anna_lynn',
    commentId: 'ig_comment_123',
    message: 'ทัก inbox ได้เลยค่ะ',
    runner: async (args) => {
      calls.push(args)
      return { ok: true, response: { id: 'ig_reply_123' } }
    },
  })

  assert.deepEqual(calls[0], ['reply-ig-comment', '--page=ig_anna_lynn', '--comment-id=ig_comment_123', '--message=ทัก inbox ได้เลยค่ะ', '--approved'])
  assert.equal(result.response.id, 'ig_reply_123')
})

test('Facebook connector reads thread messages beyond conversation snippets', async () => {
  const calls = []
  const result = await listFacebookConversations({
    pageProfile: 'anna_lynn',
    runner: async (args) => {
      calls.push(args)
      if (args[0] === 'list-conversations') {
        return {
          ok: true,
          response: {
            data: [{
              id: 't_history_1',
              updated_time: '2026-05-23T17:14:24+0000',
              unread_count: 2,
              message_count: 3,
              snippet: 'latest preview',
              senders: { data: [
                { id: 'customer_1', name: 'Customer One' },
                { id: '122106446570001676', name: 'Anna Lynn' },
              ] },
            }],
          },
        }
      }
      if (args[0] === 'read-thread') {
        return {
          ok: true,
          response: {
            data: [
              {
                id: 'mid_out_1',
                created_time: '2026-05-23T17:14:24+0000',
                from: { id: '122106446570001676', name: 'Anna Lynn' },
                message: 'รับทราบค่ะ',
              },
              {
                id: 'mid_in_1',
                created_time: '2026-05-23T17:14:22+0000',
                from: { id: 'customer_1', name: 'Customer One' },
                message: 'ที่อยู่',
              },
            ],
          },
        }
      }
      return { ok: false, error: 'unexpected_call' }
    },
  })

  assert.deepEqual(calls[0], ['list-conversations', '--page=anna_lynn'])
  assert.deepEqual(calls[1], ['read-thread', '--page=anna_lynn', '--conversation-id=t_history_1', '--limit=20'])
  assert.equal(result.messages.length, 2)
  assert.equal(result.messages[0].id, 'fb_msg_mid_out_1')
  assert.equal(result.messages[0].direction, 'outbound')
  assert.equal(result.messages[0].authorName, 'Anna Lynn')
  assert.equal(result.messages[1].id, 'fb_msg_mid_in_1')
  assert.equal(result.messages[1].direction, 'inbound')
  assert.equal(result.messages[1].text, 'ที่อยู่')
})

test('omni service syncs normalized Facebook conversations into memory store', () => {
  const service = createOmniService()
  const result = service.syncFacebookConversations({
    page: { pageId: '189971841184132', pageName: 'MAN KYND', omniPageId: 'page_mankynd' },
    customers: [{ id: 'fb_customer_1', displayName: 'Customer One', platform: 'facebook', providerCustomerId: '1', matchConfidence: 1 }],
    threads: [{ id: 'fb_thread_1', providerThreadId: 't_1', pageId: 'page_mankynd', platform: 'facebook', customerId: 'fb_customer_1', status: 'open', intent: 'unknown', risk: 'medium', unreadCount: 1, messageCount: 1, updatedAt: '2026-05-22T00:00:00+0000' }],
    messages: [{ id: 'fb_preview_t_1', threadId: 'fb_thread_1', direction: 'inbound', authorName: 'Customer One', text: 'hello', createdAt: '2026-05-22T00:00:00+0000', providerMessageId: 't_1:snippet' }],
  })

  assert.equal(result.threads.inserted, 1)
  assert.equal(service.getThread('fb_thread_1').messages[0].text, 'hello')

  const second = service.syncFacebookConversations({
    page: result.page,
    customers: [{ id: 'fb_customer_1', displayName: 'Customer One Updated', platform: 'facebook', providerCustomerId: '1', matchConfidence: 1 }],
    threads: [{ id: 'fb_thread_1', providerThreadId: 't_1', pageId: 'page_mankynd', platform: 'facebook', customerId: 'fb_customer_1', status: 'draft_ready', intent: 'unknown', risk: 'medium', unreadCount: 0, messageCount: 2, updatedAt: '2026-05-22T00:01:00+0000' }],
    messages: [{ id: 'fb_preview_t_1', threadId: 'fb_thread_1', direction: 'inbound', authorName: 'Customer One', text: 'updated', createdAt: '2026-05-22T00:01:00+0000', providerMessageId: 't_1:snippet' }],
  })

  assert.equal(second.threads.updated, 1)
  assert.equal(service.getThread('fb_thread_1').status, 'draft_ready')
  assert.equal(service.getThread('fb_thread_1').messages[0].text, 'updated')
})

test('omni service removes stale Facebook snippet previews when detailed messages arrive', () => {
  const service = createOmniService()
  service.syncFacebookConversations({
    page: { pageId: '122106446570001676', pageName: 'Anna Lynn', omniPageId: 'page_annalynn' },
    customers: [{ id: 'fb_customer_1', displayName: 'Customer One', platform: 'facebook', providerCustomerId: '1', matchConfidence: 1 }],
    threads: [{ id: 'fb_t_stale', providerThreadId: 't_stale', pageId: 'page_annalynn', platform: 'facebook', customerId: 'fb_customer_1', status: 'open', intent: 'unknown', risk: 'medium', unreadCount: 1, messageCount: 1, updatedAt: '2026-05-23T00:00:00+0000' }],
    messages: [{ id: 'fb_preview_t_stale', threadId: 'fb_t_stale', direction: 'inbound', authorName: 'Customer One', text: 'preview text', createdAt: '2026-05-23T00:00:00+0000', providerMessageId: 't_stale:snippet', sourceRef: 'meta_conversation:t_stale' }],
  })

  service.syncFacebookConversations({
    page: { pageId: '122106446570001676', pageName: 'Anna Lynn', omniPageId: 'page_annalynn' },
    customers: [{ id: 'fb_customer_1', displayName: 'Customer One', platform: 'facebook', providerCustomerId: '1', matchConfidence: 1 }],
    threads: [{ id: 'fb_t_stale', providerThreadId: 't_stale', pageId: 'page_annalynn', platform: 'facebook', customerId: 'fb_customer_1', status: 'open', intent: 'unknown', risk: 'medium', unreadCount: 1, messageCount: 2, updatedAt: '2026-05-23T00:01:00+0000' }],
    messages: [{ id: 'fb_msg_mid_stale_1', threadId: 'fb_t_stale', direction: 'outbound', authorName: 'Anna Lynn', text: 'real message', createdAt: '2026-05-23T00:01:00+0000', providerMessageId: 'mid_stale_1', sourceRef: 'meta_thread:t_stale' }],
  })

  const messages = service.getThread('fb_t_stale').messages
  assert.equal(messages.some((message) => message.id === 'fb_preview_t_stale'), false)
  assert.equal(messages.length, 1)
  assert.equal(messages[0].text, 'real message')
})

test('normalizes Meta webhook messages into Omni memory rows', () => {
  const normalized = normalizeMetaWebhookPayload({
    object: 'page',
    entry: [{
      id: '112154661515664',
      messaging: [{
        sender: { id: 'customer_vz_1' },
        recipient: { id: '112154661515664' },
        timestamp: 1779470000000,
        referral: {
          source: 'ADS',
          ad_id: 'ad_123',
          ads_context_data: {
            ad_title: 'เดรสดำโปรเปิดตัว',
            campaign_name: 'Anna Lynn Launch',
            post_id: '112154661515664_999',
          },
        },
        message: { mid: 'mid_vz_1', text: 'มีสินค้าไหม' },
      }],
    }],
  })

  assert.equal(normalized.threads[0].pageId, 'page_fb_112154661515664')
  assert.equal(normalized.messages[0].direction, 'inbound')
  assert.equal(normalized.messages[0].text, 'มีสินค้าไหม')
  assert.equal(normalized.threads[0].originContext.sourceType, 'ad')
  assert.equal(normalized.threads[0].originContext.ad.id, 'ad_123')
  assert.equal(normalized.threads[0].originContext.ad.title, 'เดรสดำโปรเปิดตัว')
  assert.equal(normalized.threads[0].originContext.post.id, '112154661515664_999')
  assert.match(normalized.threads[0].originContext.replyFrame, /แอด\/โพสต์/)
})

test('normalizes Meta live referral context into Omni origin rows', () => {
  const normalized = normalizeMetaWebhookPayload({
    object: 'page',
    entry: [{
      id: '122106446570001676',
      messaging: [{
        sender: { id: 'customer_live_1' },
        recipient: { id: '122106446570001676' },
        timestamp: 1779470000000,
        referral: {
          source: 'LIVE',
          type: 'OPEN_THREAD',
          ref: 'live_ref_001',
          live_id: 'live_anna_001',
          video_id: 'video_anna_001',
          product_id: 'prod_black_m',
          sku: 'DRESS-BLK-M',
          product_name: 'เดรสดำ',
          color: 'ดำ',
          size: 'M',
        },
        message: { mid: 'mid_live_1', text: 'ตัวนี้มีไหม' },
      }],
    }],
  })

  assert.equal(normalized.threads[0].originContext.sourceType, 'live')
  assert.equal(normalized.threads[0].originContext.live.id, 'live_anna_001')
  assert.equal(normalized.threads[0].originContext.live.videoId, 'video_anna_001')
  assert.equal(normalized.threads[0].originContext.live.productId, 'prod_black_m')
  assert.equal(normalized.threads[0].originContext.live.sku, 'DRESS-BLK-M')
  assert.equal(normalized.threads[0].originContext.productHint.text, 'เดรสดำ')
  assert.equal(normalized.threads[0].originContext.productHint.color, 'ดำ')
  assert.equal(normalized.threads[0].originContext.productHint.size, 'M')
  assert.match(normalized.threads[0].originContext.replyFrame, /ไลฟ์/)
})

test('normalizes Meta live referral without product without using ref as product hint', () => {
  const normalized = normalizeMetaWebhookPayload({
    object: 'page',
    entry: [{
      id: '122106446570001676',
      messaging: [{
        sender: { id: 'customer_live_unknown_1' },
        recipient: { id: '122106446570001676' },
        timestamp: 1779470000000,
        referral: {
          source: 'LIVE',
          ref: 'live-general-entrypoint',
          live_id: 'live_anna_unknown_001',
        },
        message: { mid: 'mid_live_unknown_1', text: 'ตัวนี้มีไหม' },
      }],
    }],
  })

  assert.equal(normalized.threads[0].originContext.sourceType, 'live')
  assert.equal(normalized.threads[0].originContext.ref, 'live-general-entrypoint')
  assert.equal(normalized.threads[0].originContext.live.id, 'live_anna_unknown_001')
  assert.equal(normalized.threads[0].originContext.productHint, undefined)
})

test('normalizes Meta page feed webhook changes into Omni post rows', () => {
  const normalized = normalizeMetaWebhookPayload({
    object: 'page',
    entry: [{
      id: '122106446570001676',
      time: 1779470000,
      changes: [{
        field: 'feed',
        value: {
          item: 'comment',
          verb: 'add',
          post_id: '122106446570001676_555',
          comment_id: '122106446570001676_555_777',
          sender_id: 'customer_feed_1',
          sender_name: 'Feed Customer',
          message: 'สนใจโพสต์นี้ค่ะ',
          post_message: 'เดรสดำไซซ์ M โปรวันนี้',
          created_time: 1779470001,
        },
      }],
    }],
  })

  assert.equal(normalized.customers[0].displayName, 'Feed Customer')
  assert.equal(normalized.threads[0].pageId, 'page_annalynn')
  assert.equal(normalized.threads[0].platform, 'facebook_comment')
  assert.equal(normalized.threads[0].providerThreadId, '122106446570001676_555')
  assert.equal(normalized.threads[0].intent, 'comment')
  assert.equal(normalized.messages[0].direction, 'inbound')
  assert.equal(normalized.messages[0].providerMessageId, '122106446570001676_555_777')
  assert.equal(normalized.messages[0].text, 'สนใจโพสต์นี้ค่ะ')
  assert.match(normalized.messages[0].sourceRef, /^meta_feed:122106446570001676:comment:add$/)
  assert.equal(normalized.threads[0].originContext.sourceType, 'post_comment')
  assert.equal(normalized.threads[0].originContext.post.id, '122106446570001676_555')
  assert.equal(normalized.threads[0].originContext.productHint.color, 'ดำ')
  assert.equal(normalized.threads[0].originContext.productHint.size, 'M')
})

test('normalizes Meta page video comment webhook changes into Omni video comment rows', () => {
  const normalized = normalizeMetaWebhookPayload({
    object: 'page',
    entry: [{
      id: '122106446570001676',
      time: 1779470400,
      changes: [{
        field: 'feed',
        value: {
          item: 'video_comment',
          verb: 'add',
          video_id: 'video_555',
          comment_id: 'video_comment_777',
          sender_id: 'customer_video_1',
          sender_name: 'Video Customer',
          message: 'สนใจรีลนี้ค่ะ',
          created_time: 1779470401,
        },
      }],
    }],
  })

  assert.equal(normalized.customers[0].displayName, 'Video Customer')
  assert.equal(normalized.threads[0].pageId, 'page_annalynn')
  assert.equal(normalized.threads[0].platform, 'facebook_video_comment')
  assert.equal(normalized.threads[0].providerThreadId, 'video_555')
  assert.equal(normalized.threads[0].intent, 'comment')
  assert.equal(normalized.messages[0].direction, 'inbound')
  assert.equal(normalized.messages[0].providerMessageId, 'video_comment_777')
  assert.equal(normalized.messages[0].text, 'สนใจรีลนี้ค่ะ')
  assert.match(normalized.messages[0].sourceRef, /^meta_feed:122106446570001676:video_comment:add$/)
  assert.equal(normalized.threads[0].originContext.sourceType, 'video_comment')
  assert.equal(normalized.threads[0].originContext.post.id, 'video_555')
  assert.equal(normalized.threads[0].originContext.post.videoId, 'video_555')
  assert.match(normalized.threads[0].originContext.replyFrame, /รีล\/วิดีโอ/)
})

test('normalizes Instagram DM webhook payload into Omni memory rows', () => {
  const normalized = normalizeMetaWebhookPayload({
    object: 'instagram',
    entry: [{
      id: '17841456216401165',
      messaging: [{
        sender: { id: 'ig_customer_1' },
        recipient: { id: '17841456216401165' },
        timestamp: 1779470000000,
        message: { mid: 'ig_mid_1', text: 'มีไซซ์ไหมคะ' },
      }],
    }],
  })

  assert.equal(normalized.customers[0].platform, 'instagram')
  assert.equal(normalized.threads[0].pageId, 'page_ig_annalynn')
  assert.equal(normalized.threads[0].platform, 'instagram')
  assert.equal(normalized.messages[0].id, 'ig_msg_ig_mid_1')
  assert.equal(normalized.messages[0].sourceRef, 'instagram_webhook:17841456216401165')
})

test('normalizes Instagram comment webhook payload into Omni comment rows', () => {
  const normalized = normalizeMetaWebhookPayload({
    object: 'instagram',
    entry: [{
      id: '17841456216401165',
      time: 1779470000,
      changes: [{
        field: 'comments',
        value: {
          media_id: 'ig_media_555',
          comment_id: 'ig_comment_777',
          from: { id: 'ig_customer_2', username: 'buyer_ig' },
          text: 'เดรสดำไซซ์ M ยังมีไหม',
          created_time: 1779470001,
        },
      }],
    }],
  })

  assert.equal(normalized.customers[0].displayName, 'buyer_ig')
  assert.equal(normalized.customers[0].platform, 'instagram')
  assert.equal(normalized.threads[0].pageId, 'page_ig_annalynn')
  assert.equal(normalized.threads[0].platform, 'instagram_comment')
  assert.equal(normalized.threads[0].providerThreadId, 'ig_media_555')
  assert.equal(normalized.messages[0].providerMessageId, 'ig_comment_777')
  assert.equal(normalized.threads[0].originContext.productHint.color, 'ดำ')
  assert.equal(normalized.threads[0].originContext.productHint.size, 'M')
})

test('omni service syncs Meta webhook messages into memory store', () => {
  const service = createOmniService()
  const result = service.syncFacebookWebhookEvents(normalizeMetaWebhookPayload({
    object: 'page',
    entry: [{
      id: '122106446570001676',
      messaging: [{
        sender: { id: 'customer_anna_1' },
        recipient: { id: '122106446570001676' },
        timestamp: 1779470000000,
        message: { mid: 'mid_anna_1', text: 'ราคาเท่าไหร่' },
      }],
    }],
  }))

  assert.equal(result.threads.inserted, 1)
  assert.equal(result.messages.inserted, 1)
})

test('omni service merges Meta webhook messages into existing conversation thread', () => {
  const service = createOmniService()
  service.syncFacebookConversations({
    page: { pageId: '122106446570001676', pageName: 'Anna Lynn', omniPageId: 'page_annalynn' },
    customers: [{ id: 'fb_customer_customer_1', displayName: 'Customer One', platform: 'facebook', providerCustomerId: 'customer_1', matchConfidence: 1 }],
    threads: [{ id: 'fb_t_conversation_1', providerThreadId: 't_conversation_1', pageId: 'page_annalynn', platform: 'facebook', customerId: 'fb_customer_customer_1', status: 'draft_ready', intent: 'unknown', risk: 'medium', unreadCount: 0, messageCount: 2, updatedAt: '2026-05-23T17:00:00+0000' }],
    messages: [{ id: 'fb_msg_existing_1', threadId: 'fb_t_conversation_1', direction: 'inbound', authorName: 'Customer One', text: 'old message', createdAt: '2026-05-23T17:00:00+0000', providerMessageId: 'existing_1', sourceRef: 'meta_thread:t_conversation_1' }],
  })

  service.syncFacebookWebhookEvents(normalizeMetaWebhookPayload({
    object: 'page',
    entry: [{
      id: '122106446570001676',
      messaging: [{
        sender: { id: 'customer_1' },
        recipient: { id: '122106446570001676' },
        timestamp: Date.parse('2026-05-23T18:00:00.000Z'),
        message: { mid: 'webhook_mid_1', text: 'new realtime message' },
      }],
    }],
  }))

  const existing = service.getThread('fb_t_conversation_1')
  assert.equal(existing.messages.some((message) => message.providerMessageId === 'webhook_mid_1'), true)
  assert.equal(existing.messageCount, 3)
  assert.equal(existing.unreadCount, 1)
  assert.equal(service.listThreads().some((thread) => thread.id.startsWith('fb_webhook_') && thread.customerId === 'fb_customer_customer_1'), false)
})

test('AI reply engine drafts guarded replies from thread memory', async () => {
  const service = createOmniService()
  const thread = service.getThread('thread_1')
  const ai = createAiReplyEngine({ provider: 'local_rules', model: 'test' })
  const decision = await ai.draft({ thread, snapshot: service.snapshot(), policy: service.getPolicyForThread(thread) })

  assert.equal(decision.ok, true)
  assert.equal(decision.intent, 'stock')
  assert.equal(decision.allowed, true)
  assert.match(decision.draftText, /เช็กสต็อก/)
  assert.match(decision.draftText, /สี.*ไซซ์/)
  assert.equal(decision.draftText.length > 80, true)
  assert.equal(decision.sourceIds.some((id) => id.startsWith('ks_')), true)
  assert.equal(decision.sourceIds.every((id) => id.startsWith('ks_')), true)
  assert.deepEqual(decision.evidenceIds, ['msg_1'])
})

test('AI reply engine asks narrowly when customer came from live without product identity', async () => {
  const seed = createOmniSeed()
  seed.customers.push({ id: 'cust_live_unknown', displayName: 'Live Customer', matchConfidence: 1 })
  seed.threads.push({
    id: 'thread_live_unknown',
    pageId: 'page_annalynn',
    platform: 'facebook',
    customerId: 'cust_live_unknown',
    status: 'open',
    intent: 'unknown',
    risk: 'low',
    unreadCount: 1,
    messageCount: 1,
    updatedAt: '2026-05-29T08:00:00.000Z',
    originContext: {
      channel: 'facebook_live',
      sourceType: 'live',
      live: { id: 'live_anna_001', clickedAt: '2026-05-29T08:00:00.000Z' },
      replyFrame: 'ลูกค้ามาจากไลฟ์ ให้ถามกลับเฉพาะสินค้าในไลฟ์ถ้ายังระบุไม่ได้',
    },
  })
  seed.messages.push({
    id: 'msg_live_unknown',
    threadId: 'thread_live_unknown',
    direction: 'inbound',
    authorName: 'Live Customer',
    text: 'ตัวนี้มีไหม',
    createdAt: '2026-05-29T08:00:00.000Z',
    originContext: seed.threads.at(-1).originContext,
  })
  const service = createOmniService(seed)
  const thread = service.getThread('thread_live_unknown')
  const ai = createAiReplyEngine({ provider: 'local_rules', model: 'test' })
  const decision = await ai.draft({ thread, snapshot: service.snapshot(), policy: service.getPolicyForThread(thread) })

  assert.equal(decision.originContext.sourceType, 'live')
  assert.match(decision.draftText, /สนใจตัวไหนในไลฟ์/)
  assert.doesNotMatch(decision.draftText, /ส่งรูป/)
})

test('AI reply engine answers from EasyStore inventory facts instead of promising to check', async () => {
  const seed = createOmniSeed()
  seed.customers.push({ id: 'cust_amanda_stock', displayName: 'Amanda Customer', matchConfidence: 1 })
  seed.threads.push({
    id: 'thread_amanda_stock',
    pageId: 'page_annalynn',
    platform: 'facebook',
    customerId: 'cust_amanda_stock',
    status: 'open',
    intent: 'unknown',
    risk: 'low',
    unreadCount: 1,
    messageCount: 1,
    updatedAt: '2026-06-04T05:00:00.000Z',
  })
  seed.messages.push({
    id: 'msg_amanda_stock',
    threadId: 'thread_amanda_stock',
    direction: 'inbound',
    authorName: 'Amanda Customer',
    text: 'สนใจ Amanda Jumpsuit มีของไหม ราคาเท่าไหร่',
    createdAt: '2026-06-04T05:00:00.000Z',
    providerMessageId: 'mid_amanda_stock',
  })
  seed.inventorySnapshots.push(
    { id: 'es_stock_16462646_1', sku: 'AMANDA-BLK-M', source: 'easystore', available: 3, checkedAt: '2026-06-04T04:55:00.000Z', productId: '16462646', variantId: '1', productName: 'Amanda Jumpsuit', price: 1290 },
    { id: 'es_stock_16462646_2', sku: 'AMANDA-BLK-L', source: 'easystore', available: 0, checkedAt: '2026-06-04T04:55:00.000Z', productId: '16462646', variantId: '2', productName: 'Amanda Jumpsuit', price: 1290 },
  )
  const service = createOmniService(seed)
  const thread = service.getThread('thread_amanda_stock')
  const ai = createAiReplyEngine({ provider: 'local_rules', model: 'test' })
  const decision = await ai.draft({ thread, snapshot: service.snapshot(), policy: service.getPolicyForThread(thread) })

  assert.equal(decision.ok, true)
  assert.equal(decision.intent, 'stock')
  assert.match(decision.draftText, /เช็กให้แล้ว/)
  assert.match(decision.draftText, /Amanda Jumpsuit/)
  assert.match(decision.draftText, /พร้อมส่งรวม 3 ชิ้น/)
  assert.match(decision.draftText, /1,290/)
  assert.doesNotMatch(decision.draftText, /เดี๋ยว.*เช็ก/)
})

test('AI reply engine answers from live EasyStore lookup when inventory snapshot is missing', async () => {
  const seed = createOmniSeed()
  seed.customers.push({ id: 'cust_molly_live_stock', displayName: 'Molly Customer', matchConfidence: 1 })
  seed.threads.push({
    id: 'thread_molly_live_stock',
    pageId: 'page_annalynn',
    platform: 'facebook',
    customerId: 'cust_molly_live_stock',
    status: 'open',
    intent: 'unknown',
    risk: 'low',
    unreadCount: 1,
    messageCount: 1,
    updatedAt: '2026-06-05T09:20:00.000Z',
  })
  seed.messages.push({
    id: 'msg_molly_live_stock',
    threadId: 'thread_molly_live_stock',
    direction: 'inbound',
    authorName: 'Molly Customer',
    text: 'Molly ดำ M มีของไหม ราคาเท่าไหร่',
    createdAt: '2026-06-05T09:20:00.000Z',
    providerMessageId: 'mid_molly_live_stock',
  })
  const calls = []
  const easyStore = {
    async searchProducts({ keyword, limit }) {
      calls.push({ keyword, limit })
      return {
        ok: true,
        source: 'easystore_live',
        products: [{
          id: 'es_live_16469999_76019999',
          productId: '16469999',
          variantId: '76019999',
          sku: 'MOLLY-BLK-M',
          source: 'easystore_live',
          productName: 'Molly Dress',
          name: 'Molly Dress สีดำ ไซซ์ M',
          color: 'ดำ',
          size: 'M',
          sellPrice: 790,
          stock: 8,
          imageUrl: 'https://cdn.example/molly.jpg',
        }],
      }
    },
  }
  const service = createOmniService(seed)
  const thread = service.getThread('thread_molly_live_stock')
  const ai = createAiReplyEngine({ provider: 'local_rules', model: 'test', easyStore })
  const decision = await ai.draft({ thread, snapshot: service.snapshot(), policy: service.getPolicyForThread(thread) })

  assert.equal(calls.length, 1)
  assert.match(calls[0].keyword, /molly/i)
  assert.equal(decision.ok, true)
  assert.equal(decision.intent, 'stock')
  assert.equal(decision.reason, 'easystore_live_product_fact_match')
  assert.match(decision.draftText, /Molly Dress/)
  assert.match(decision.draftText, /พร้อมส่งรวม 8 ชิ้น/)
  assert.match(decision.draftText, /790/)
  assert.deepEqual(decision.sourceIds.includes('es_live_16469999_76019999'), true)
  assert.equal(decision.productFacts.source, 'easystore_live')
})

test('AI reply engine holds live EasyStore results that conflict with the product discussed in chat', async () => {
  const seed = createOmniSeed()
  seed.customers.push({ id: 'cust_molly_yellow_conflict', displayName: 'Molly Conflict Customer', matchConfidence: 1 })
  seed.threads.push({
    id: 'thread_molly_yellow_conflict',
    pageId: 'page_annalynn',
    platform: 'facebook',
    customerId: 'cust_molly_yellow_conflict',
    status: 'open',
    intent: 'unknown',
    risk: 'low',
    unreadCount: 1,
    messageCount: 3,
    updatedAt: '2026-06-05T04:08:22.441Z',
  })
  seed.messages.push(
    {
      id: 'msg_molly_context',
      threadId: 'thread_molly_yellow_conflict',
      direction: 'inbound',
      authorName: 'Molly Conflict Customer',
      text: 'รุ่นmollyนั',
      createdAt: '2026-06-05T02:34:45.590Z',
      providerMessageId: 'mid_molly_context',
    },
    {
      id: 'msg_molly_context_reply',
      threadId: 'thread_molly_yellow_conflict',
      direction: 'outbound',
      authorName: 'Anna Lynn AI',
      text: 'รับทราบค่ะ รุ่น Molly รบกวนแจ้งสีและไซซ์ที่ต้องการด้วยนะคะ',
      createdAt: '2026-06-05T02:34:48.311Z',
      providerMessageId: 'mid_molly_context_reply',
    },
    {
      id: 'msg_molly_yellow',
      threadId: 'thread_molly_yellow_conflict',
      direction: 'inbound',
      authorName: 'Molly Conflict Customer',
      text: 'มีเหลืองมีไหม',
      createdAt: '2026-06-05T04:08:22.441Z',
      providerMessageId: 'mid_molly_yellow',
    },
  )
  const easyStore = {
    async searchProducts() {
      return {
        ok: true,
        products: [{
          id: 'es_stock_16462394_76013298',
          productId: '16462394',
          variantId: '76013298',
          sku: 'lorสีเหลืองM',
          productName: 'Lorra เดรสเชิ้ต Polo คอปก แขนสั้น กระดุมหน้า 5 เม็ด',
          color: 'เหลือง',
          size: 'M',
          sellPrice: 1290,
          stock: 0,
        }],
      }
    },
  }
  const service = createOmniService(seed)
  const thread = service.getThread('thread_molly_yellow_conflict')
  const ai = createAiReplyEngine({ provider: 'local_rules', model: 'test', easyStore })
  const decision = await ai.draft({ thread, snapshot: service.snapshot(), policy: service.getPolicyForThread(thread) })

  assert.equal(decision.intent, 'stock')
  assert.equal(decision.allowed, false)
  assert.equal(decision.action, 'needs_approval')
  assert.equal(decision.reason, 'easystore_live_product_conflict')
  assert.equal(decision.productFacts, null)
  assert.match(decision.draftText, /แอดมินตรวจ|ตรวจรุ่น|ตรวจสต็อก/)
  assert.doesNotMatch(decision.draftText, /Lorra|พร้อมส่ง|ส่งภาพ/)
})

test('AI reply engine does not claim ready stock when live EasyStore stock is zero', async () => {
  const seed = createOmniSeed()
  seed.customers.push({ id: 'cust_molly_yellow_zero', displayName: 'Molly Zero Customer', matchConfidence: 1 })
  seed.threads.push({
    id: 'thread_molly_yellow_zero',
    pageId: 'page_annalynn',
    platform: 'facebook',
    customerId: 'cust_molly_yellow_zero',
    status: 'open',
    intent: 'unknown',
    risk: 'low',
    unreadCount: 1,
    messageCount: 1,
    updatedAt: '2026-06-05T04:09:22.441Z',
  })
  seed.messages.push({
    id: 'msg_molly_yellow_zero',
    threadId: 'thread_molly_yellow_zero',
    direction: 'inbound',
    authorName: 'Molly Zero Customer',
    text: 'Molly สีเหลืองมีไหม',
    createdAt: '2026-06-05T04:09:22.441Z',
    providerMessageId: 'mid_molly_yellow_zero',
  })
  const easyStore = {
    async searchProducts() {
      return {
        ok: true,
        products: [{
          id: 'es_live_molly_yellow_m',
          productId: '16469999',
          variantId: '76019998',
          sku: 'MOLLY-YELLOW-M',
          productName: 'Molly Dress',
          color: 'เหลือง',
          size: 'M',
          sellPrice: 790,
          stock: 0,
        }],
      }
    },
  }
  const service = createOmniService(seed)
  const thread = service.getThread('thread_molly_yellow_zero')
  const ai = createAiReplyEngine({ provider: 'local_rules', model: 'test', easyStore })
  const decision = await ai.draft({ thread, snapshot: service.snapshot(), policy: service.getPolicyForThread(thread) })

  assert.equal(decision.reason, 'easystore_live_product_fact_match')
  assert.equal(decision.productFacts.availableTotal, 0)
  assert.match(decision.draftText, /ยังไม่พบสต็อกคงเหลือ|หมด/)
  assert.doesNotMatch(decision.draftText, /มีพร้อมส่ง|พร้อมส่งค่ะ|มีสินค้า|ยังมี/)
  assert.doesNotMatch(decision.draftText, /ส่งภาพ/)
})

test('AI reply engine scores live EasyStore results instead of trusting the first product', async () => {
  const seed = createOmniSeed()
  seed.customers.push({ id: 'cust_lorra_live_score', displayName: 'Lorra Customer', matchConfidence: 1 })
  seed.threads.push({
    id: 'thread_lorra_live_score',
    pageId: 'page_annalynn',
    platform: 'facebook',
    customerId: 'cust_lorra_live_score',
    status: 'open',
    intent: 'unknown',
    risk: 'low',
    unreadCount: 1,
    messageCount: 1,
    updatedAt: '2026-06-05T09:40:00.000Z',
  })
  seed.messages.push({
    id: 'msg_lorra_live_score',
    threadId: 'thread_lorra_live_score',
    direction: 'inbound',
    authorName: 'Lorra Customer',
    text: 'Lorra ดำ XL มีของไหม ราคาเท่าไหร่',
    createdAt: '2026-06-05T09:40:00.000Z',
    providerMessageId: 'mid_lorra_live_score',
  })
  const easyStore = {
    async searchProducts() {
      return {
        ok: true,
        products: [
          {
            id: 'es_live_wrong_first',
            productId: '16460000',
            variantId: 'wrong',
            sku: 'AMANDA-BLK-XL',
            productName: 'Amanda Jumpsuit',
            sellPrice: 1490,
            stock: 9,
          },
          {
            id: 'es_live_lorra_black_xl',
            productId: '16462646',
            variantId: 'xl',
            sku: 'LORRA-BLK-XL',
            productName: 'Lorra เดรสเชิ้ต Polo สีดำ',
            sellPrice: 1290,
            stock: 4,
          },
        ],
      }
    },
  }
  const service = createOmniService(seed)
  const thread = service.getThread('thread_lorra_live_score')
  const ai = createAiReplyEngine({ provider: 'local_rules', model: 'test', easyStore })
  const decision = await ai.draft({ thread, snapshot: service.snapshot(), policy: service.getPolicyForThread(thread) })

  assert.equal(decision.reason, 'easystore_live_product_fact_match')
  assert.match(decision.draftText, /Lorra เดรสเชิ้ต Polo/)
  assert.match(decision.draftText, /พร้อมส่งรวม 4 ชิ้น/)
  assert.match(decision.draftText, /1,290/)
  assert.doesNotMatch(decision.draftText, /Amanda/)
  assert.equal(decision.productFacts.productId, '16462646')
})

test('AI reply engine prioritizes exact EasyStore SKU over newer color-only product matches', async () => {
  const seed = createOmniSeed()
  seed.customers.push({ id: 'cust_polo_stock', displayName: 'Polo Customer', matchConfidence: 1 })
  seed.threads.push({
    id: 'thread_polo_stock',
    pageId: 'page_annalynn',
    platform: 'facebook',
    customerId: 'cust_polo_stock',
    status: 'open',
    intent: 'unknown',
    risk: 'low',
    unreadCount: 1,
    messageCount: 1,
    updatedAt: '2026-06-04T05:00:00.000Z',
  })
  seed.messages.push({
    id: 'msg_polo_stock',
    threadId: 'thread_polo_stock',
    direction: 'inbound',
    authorName: 'Polo Customer',
    text: 'สนใจ poloดำM มีของไหม ราคาเท่าไหร่',
    createdAt: '2026-06-04T05:00:00.000Z',
    providerMessageId: 'mid_polo_stock',
  })
  seed.inventorySnapshots.push(
    { id: 'es_stock_polo_black_m', sku: 'poloดำM', source: 'easystore', available: 20, checkedAt: '2026-06-04T04:35:16.000Z', productId: '16462402', variantId: '76013354', productName: 'เสื้อเชิ้ตโปโลผู้หญิง', price: 590 },
    { id: 'es_stock_cropset_black_1', sku: 'cropsetดำ1', source: 'easystore', available: 0, checkedAt: '2026-06-04T04:55:09.000Z', productId: '16462572', variantId: '76014489', productName: 'ชุดเซ็ต โอเวอร์ไซซ์ สีดำ', price: 499 },
  )
  const service = createOmniService(seed)
  const thread = service.getThread('thread_polo_stock')
  const ai = createAiReplyEngine({ provider: 'local_rules', model: 'test' })
  const decision = await ai.draft({ thread, snapshot: service.snapshot(), policy: service.getPolicyForThread(thread) })

  assert.equal(decision.ok, true)
  assert.match(decision.draftText, /เสื้อเชิ้ตโปโลผู้หญิง/)
  assert.match(decision.draftText, /พร้อมส่งรวม 20 ชิ้น/)
  assert.match(decision.draftText, /590/)
  assert.doesNotMatch(decision.draftText, /ชุดเซ็ต/)
  assert.deepEqual(decision.sourceIds.includes('es_stock_polo_black_m'), true)
})

test('AI reply engine classifies product image requests as human attachment work', async () => {
  const seed = createOmniSeed()
  seed.customers.push({ id: 'cust_lorra_image', displayName: 'Image Customer', matchConfidence: 1 })
  seed.threads.push({
    id: 'thread_lorra_image',
    pageId: 'page_annalynn',
    platform: 'facebook',
    customerId: 'cust_lorra_image',
    status: 'open',
    intent: 'unknown',
    risk: 'low',
    unreadCount: 1,
    messageCount: 1,
    updatedAt: '2026-06-04T05:10:00.000Z',
  })
  seed.messages.push({
    id: 'msg_lorra_image',
    threadId: 'thread_lorra_image',
    direction: 'inbound',
    authorName: 'Image Customer',
    text: 'ขอดูภาพสีเทา 2xl',
    createdAt: '2026-06-04T05:10:00.000Z',
    providerMessageId: 'mid_lorra_image',
  })
  const service = createOmniService(seed)
  const thread = service.getThread('thread_lorra_image')
  const ai = createAiReplyEngine({ provider: 'local_rules', model: 'test' })
  const decision = await ai.draft({ thread, snapshot: service.snapshot(), policy: service.getPolicyForThread(thread) })

  assert.equal(decision.ok, true)
  assert.equal(decision.intent, 'productImage')
  assert.equal(decision.allowed, false)
  assert.equal(decision.action, 'needs_approval')
  assert.match(decision.draftText, /แนบรูปสินค้าจริง|product card/)
  assert.doesNotMatch(decision.draftText, /เดี๋ยวส่งให้ดู|ยินดีส่งให้ดู/)
})

test('AI reply engine holds size list questions without inventory facts for human review', async () => {
  const seed = createOmniSeed()
  seed.customers.push({ id: 'cust_anna_size_list', displayName: 'Anna Size Customer', matchConfidence: 1 })
  seed.threads.push({
    id: 'thread_anna_size_list',
    pageId: 'page_annalynn',
    platform: 'facebook',
    customerId: 'cust_anna_size_list',
    status: 'open',
    intent: 'unknown',
    risk: 'low',
    unreadCount: 1,
    messageCount: 1,
    updatedAt: '2026-06-05T02:34:00.000Z',
  })
  seed.messages.push({
    id: 'msg_anna_size_list',
    threadId: 'thread_anna_size_list',
    direction: 'inbound',
    authorName: 'Anna Size Customer',
    text: 'มีขนาดอะไรบ้าง',
    createdAt: '2026-06-05T02:34:00.000Z',
    providerMessageId: 'mid_anna_size_list',
  })
  const service = createOmniService(seed)
  const thread = service.getThread('thread_anna_size_list')
  const ai = createAiReplyEngine({ provider: 'local_rules', model: 'test' })
  const decision = await ai.draft({ thread, snapshot: service.snapshot(), policy: service.getPolicyForThread(thread) })

  assert.equal(decision.intent, 'stock')
  assert.equal(decision.allowed, false)
  assert.equal(decision.action, 'needs_approval')
  assert.equal(decision.reason, 'product_question_without_inventory_fact')
  assert.doesNotMatch(decision.draftText, /มีไซซ์เดียว|สีมะนาว|เหลืองอ่อน/)
})

test('AI reply engine escalates customer corrections instead of looping auto replies', async () => {
  const seed = createOmniSeed()
  seed.customers.push({ id: 'cust_anna_correction', displayName: 'Anna Correction Customer', matchConfidence: 1 })
  seed.threads.push({
    id: 'thread_anna_correction',
    pageId: 'page_annalynn',
    platform: 'facebook',
    customerId: 'cust_anna_correction',
    status: 'open',
    intent: 'unknown',
    risk: 'low',
    unreadCount: 1,
    messageCount: 2,
    updatedAt: '2026-06-05T02:34:30.000Z',
  })
  seed.messages.push(
    {
      id: 'msg_anna_wrong_reply',
      threadId: 'thread_anna_correction',
      direction: 'outbound',
      authorName: 'Anna Lynn AI',
      text: 'ชุดเซ็ตโอเวอร์ไซซ์มีไซซ์เดียวค่ะ',
      createdAt: '2026-06-05T02:34:10.000Z',
      providerMessageId: 'mid_anna_wrong_reply',
    },
    {
      id: 'msg_anna_correction',
      threadId: 'thread_anna_correction',
      direction: 'inbound',
      authorName: 'Anna Correction Customer',
      text: 'มั่วแล้ว',
      createdAt: '2026-06-05T02:34:30.000Z',
      providerMessageId: 'mid_anna_correction',
    },
  )
  const service = createOmniService(seed)
  const thread = service.getThread('thread_anna_correction')
  const ai = createAiReplyEngine({ provider: 'local_rules', model: 'test' })
  const decision = await ai.draft({ thread, snapshot: service.snapshot(), policy: service.getPolicyForThread(thread) })

  assert.equal(decision.intent, 'humanReview')
  assert.equal(decision.allowed, false)
  assert.equal(decision.action, 'needs_approval')
  assert.equal(decision.reason, 'customer_correction_or_complaint')
  assert.match(decision.draftText, /แอดมินตรวจคำตอบ/)
})

test('AI reply engine keeps prior product context when customer sends a short nudge', async () => {
  const seed = createOmniSeed()
  seed.customers.push({ id: 'cust_anna_nudge', displayName: 'Anna Nudge Customer', matchConfidence: 1 })
  seed.threads.push({
    id: 'thread_anna_nudge',
    pageId: 'page_annalynn',
    platform: 'facebook',
    customerId: 'cust_anna_nudge',
    status: 'open',
    intent: 'unknown',
    risk: 'low',
    unreadCount: 3,
    messageCount: 4,
    updatedAt: '2026-06-05T07:00:00.000Z',
  })
  seed.messages.push(
    {
      id: 'msg_anna_nudge_question',
      threadId: 'thread_anna_nudge',
      direction: 'inbound',
      authorName: 'Anna Nudge Customer',
      text: 'ภาพสีแดง มีไหม',
      createdAt: '2026-06-05T06:59:12.000Z',
      providerMessageId: 'mid_anna_nudge_question',
    },
    {
      id: 'msg_anna_nudge_short',
      threadId: 'thread_anna_nudge',
      direction: 'inbound',
      authorName: 'Anna Nudge Customer',
      text: 'มีไหม',
      createdAt: '2026-06-05T06:59:37.000Z',
      providerMessageId: 'mid_anna_nudge_short',
    },
    {
      id: 'msg_anna_nudge_ping',
      threadId: 'thread_anna_nudge',
      direction: 'inbound',
      authorName: 'Anna Nudge Customer',
      text: 'เฮ้ยยอยู่ไหม',
      createdAt: '2026-06-05T06:59:49.000Z',
      providerMessageId: 'mid_anna_nudge_ping',
    },
  )
  const service = createOmniService(seed)
  const thread = service.getThread('thread_anna_nudge')
  const ai = createAiReplyEngine({ provider: 'local_rules', model: 'test' })
  const decision = await ai.draft({ thread, snapshot: service.snapshot(), policy: service.getPolicyForThread(thread) })

  assert.equal(decision.intent, 'productImage')
  assert.equal(decision.allowed, false)
  assert.equal(decision.action, 'needs_approval')
  assert.doesNotMatch(decision.draftText, /รับทราบค่ะ เดี๋ยวช่วยดูรายละเอียดให้ครบ/)
  assert.match(decision.draftText, /รูปสินค้าจริง|product card|ภาพสินค้า/)
})

test('AI reply engine applies sales workflow for size-only product questions', async () => {
  const seed = createOmniSeed()
  seed.customers.push({ id: 'cust_sales_size', displayName: 'Sales Size Customer', matchConfidence: 1 })
  seed.threads.push({
    id: 'thread_sales_size',
    pageId: 'page_annalynn',
    platform: 'facebook',
    customerId: 'cust_sales_size',
    status: 'open',
    intent: 'unknown',
    risk: 'low',
    unreadCount: 1,
    messageCount: 1,
    updatedAt: '2026-06-04T05:20:00.000Z',
    originContext: {
      channel: 'facebook',
      sourceType: 'post',
      post: { id: 'post_lorra', title: 'Lorra launch post' },
      productHint: { text: 'Lorra' },
    },
  })
  seed.messages.push({
    id: 'msg_sales_size',
    threadId: 'thread_sales_size',
    direction: 'inbound',
    authorName: 'Sales Size Customer',
    text: 'XL',
    createdAt: '2026-06-04T05:20:00.000Z',
    providerMessageId: 'mid_sales_size',
  })
  const service = createOmniService(seed)
  const thread = service.getThread('thread_sales_size')
  const ai = createAiReplyEngine({ provider: 'local_rules', model: 'test' })
  const decision = await ai.draft({ thread, snapshot: service.snapshot(), policy: service.getPolicyForThread(thread) })

  assert.equal(decision.intent, 'stock')
  assert.match(decision.draftText, /XL/)
  assert.match(decision.draftText, /สนใจสีไหน/)
  assert.doesNotMatch(decision.draftText, /ส่งภาพ|แนบภาพ/)
  assert.doesNotMatch(decision.draftText, /รบกวนแจ้งอก|เอว|สะโพก/)
})

test('AI reply engine applies sales workflow for color-only product questions', async () => {
  const seed = createOmniSeed()
  seed.customers.push({ id: 'cust_sales_color', displayName: 'Sales Color Customer', matchConfidence: 1 })
  seed.threads.push({
    id: 'thread_sales_color',
    pageId: 'page_annalynn',
    platform: 'facebook',
    customerId: 'cust_sales_color',
    status: 'open',
    intent: 'unknown',
    risk: 'low',
    unreadCount: 1,
    messageCount: 1,
    updatedAt: '2026-06-04T05:21:00.000Z',
    originContext: {
      channel: 'facebook',
      sourceType: 'post',
      post: { id: 'post_lorra', title: 'Lorra launch post' },
      productHint: { text: 'Lorra' },
    },
  })
  seed.messages.push({
    id: 'msg_sales_color',
    threadId: 'thread_sales_color',
    direction: 'inbound',
    authorName: 'Sales Color Customer',
    text: 'มีสีดำไหม',
    createdAt: '2026-06-04T05:21:00.000Z',
    providerMessageId: 'mid_sales_color',
  })
  const service = createOmniService(seed)
  const thread = service.getThread('thread_sales_color')
  const ai = createAiReplyEngine({ provider: 'local_rules', model: 'test' })
  const decision = await ai.draft({ thread, snapshot: service.snapshot(), policy: service.getPolicyForThread(thread) })

  assert.equal(decision.intent, 'stock')
  assert.match(decision.draftText, /สีดำ/)
  assert.doesNotMatch(decision.draftText, /ส่งภาพ|แนบภาพ/)
  assert.match(decision.draftText, /สนใจไซซ์ไหน/)
})

test('AI reply engine closes known color and size price questions with ready-to-buy answer', async () => {
  const seed = createOmniSeed()
  seed.customers.push({ id: 'cust_sales_price', displayName: 'Sales Price Customer', matchConfidence: 1 })
  seed.threads.push({
    id: 'thread_sales_price',
    pageId: 'page_annalynn',
    platform: 'facebook',
    customerId: 'cust_sales_price',
    status: 'open',
    intent: 'unknown',
    risk: 'low',
    unreadCount: 1,
    messageCount: 1,
    updatedAt: '2026-06-04T05:22:00.000Z',
    originContext: {
      channel: 'facebook',
      sourceType: 'post',
      productHint: { text: 'Lorra', color: 'ดำ', size: 'XL' },
    },
  })
  seed.messages.push({
    id: 'msg_sales_price',
    threadId: 'thread_sales_price',
    direction: 'inbound',
    authorName: 'Sales Price Customer',
    text: 'ราคาเท่าไหร่',
    createdAt: '2026-06-04T05:22:00.000Z',
    providerMessageId: 'mid_sales_price',
  })
  seed.inventorySnapshots.push(
    { id: 'es_stock_lorra_black_xl', sku: 'LORRA-BLK-XL', source: 'easystore', available: 5, checkedAt: '2026-06-04T05:20:00.000Z', productId: 'lorra', variantId: 'xl', productName: 'Lorra', price: 590 },
  )
  const service = createOmniService(seed)
  const thread = service.getThread('thread_sales_price')
  const ai = createAiReplyEngine({ provider: 'local_rules', model: 'test' })
  const decision = await ai.draft({ thread, snapshot: service.snapshot(), policy: service.getPolicyForThread(thread) })

  assert.equal(decision.intent, 'price')
  assert.match(decision.draftText, /สีดำ/)
  assert.match(decision.draftText, /ไซซ์ XL/)
  assert.match(decision.draftText, /590/)
  assert.match(decision.draftText, /พร้อมส่ง/)
  assert.doesNotMatch(decision.draftText, /สนใจสีหรือไซซ์ไหน/)
})

test('AI reply engine routes CF to payment before shipping address', async () => {
  const seed = createOmniSeed()
  seed.customers.push({ id: 'cust_sales_cf', displayName: 'Sales CF Customer', matchConfidence: 1 })
  seed.threads.push({
    id: 'thread_sales_cf',
    pageId: 'page_annalynn',
    platform: 'facebook',
    customerId: 'cust_sales_cf',
    status: 'open',
    intent: 'unknown',
    risk: 'low',
    unreadCount: 1,
    messageCount: 1,
    updatedAt: '2026-06-04T05:23:00.000Z',
    originContext: { channel: 'facebook', sourceType: 'post', productHint: { text: 'Lorra', color: 'ดำ', size: 'XL' } },
  })
  seed.messages.push({
    id: 'msg_sales_cf',
    threadId: 'thread_sales_cf',
    direction: 'inbound',
    authorName: 'Sales CF Customer',
    text: 'CF ค่ะ',
    createdAt: '2026-06-04T05:23:00.000Z',
    providerMessageId: 'mid_sales_cf',
  })
  const service = createOmniService(seed)
  const thread = service.getThread('thread_sales_cf')
  const ai = createAiReplyEngine({ provider: 'local_rules', model: 'test' })
  const decision = await ai.draft({ thread, snapshot: service.snapshot(), policy: service.getPolicyForThread(thread) })

  assert.equal(decision.intent, 'orderPurchase')
  assert.equal(decision.allowed, false)
  assert.match(decision.draftText, /สรุปรายการ/)
  assert.match(decision.draftText, /ชำระ/)
  assert.match(decision.draftText, /ส่งสลิป/)
  assert.doesNotMatch(decision.draftText, /ที่อยู่/)
})

test('AI reply engine asks shipping details after payment proof', async () => {
  const seed = createOmniSeed()
  seed.customers.push({ id: 'cust_sales_slip', displayName: 'Sales Slip Customer', matchConfidence: 1 })
  seed.threads.push({
    id: 'thread_sales_slip',
    pageId: 'page_annalynn',
    platform: 'facebook',
    customerId: 'cust_sales_slip',
    status: 'open',
    intent: 'unknown',
    risk: 'low',
    unreadCount: 1,
    messageCount: 1,
    updatedAt: '2026-06-04T05:24:00.000Z',
  })
  seed.messages.push({
    id: 'msg_sales_slip',
    threadId: 'thread_sales_slip',
    direction: 'inbound',
    authorName: 'Sales Slip Customer',
    text: 'โอนแล้วค่ะ ส่งสลิปให้แล้ว',
    createdAt: '2026-06-04T05:24:00.000Z',
    providerMessageId: 'mid_sales_slip',
  })
  const service = createOmniService(seed)
  const thread = service.getThread('thread_sales_slip')
  const ai = createAiReplyEngine({ provider: 'local_rules', model: 'test' })
  const decision = await ai.draft({ thread, snapshot: service.snapshot(), policy: service.getPolicyForThread(thread) })

  assert.equal(decision.intent, 'paymentProof')
  assert.match(decision.draftText, /ขอบคุณ/)
  assert.match(decision.draftText, /ชื่อ/)
  assert.match(decision.draftText, /เบอร์โทร/)
  assert.match(decision.draftText, /ที่อยู่จัดส่ง/)
})

test('AI reply engine asks body measurements for size advice', async () => {
  const seed = createOmniSeed()
  seed.customers.push({ id: 'cust_sales_size_advice', displayName: 'Sales Size Advice Customer', matchConfidence: 1 })
  seed.threads.push({
    id: 'thread_sales_size_advice',
    pageId: 'page_annalynn',
    platform: 'facebook',
    customerId: 'cust_sales_size_advice',
    status: 'open',
    intent: 'unknown',
    risk: 'low',
    unreadCount: 1,
    messageCount: 1,
    updatedAt: '2026-06-04T05:25:00.000Z',
    originContext: { channel: 'facebook', sourceType: 'post', productHint: { text: 'Lorra' } },
  })
  seed.messages.push({
    id: 'msg_sales_size_advice',
    threadId: 'thread_sales_size_advice',
    direction: 'inbound',
    authorName: 'Sales Size Advice Customer',
    text: 'ไซซ์ไหนดี ใส่ได้ไหม',
    createdAt: '2026-06-04T05:25:00.000Z',
    providerMessageId: 'mid_sales_size_advice',
  })
  const service = createOmniService(seed)
  const thread = service.getThread('thread_sales_size_advice')
  const ai = createAiReplyEngine({ provider: 'local_rules', model: 'test' })
  const decision = await ai.draft({ thread, snapshot: service.snapshot(), policy: service.getPolicyForThread(thread) })

  assert.equal(decision.intent, 'sizeAdvice')
  assert.match(decision.draftText, /อก/)
  assert.match(decision.draftText, /เอว/)
  assert.match(decision.draftText, /สะโพก/)
})

test('AI reply engine requests OpenAI structured JSON output for guarded drafts', async () => {
  const previousKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = 'test-openai-key'
  const calls = []
  const service = createOmniService()
  const thread = service.getThread('thread_1')
  const ai = createAiReplyEngine({
    provider: 'openai',
    model: 'gpt-4.1-mini',
    fetchImpl: async (url, options) => {
      calls.push({ url, headers: options.headers, body: JSON.parse(options.body) })
      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                draftText: 'ได้ค่ะ เดี๋ยวช่วยเช็กสีและไซซ์จากสินค้าที่สนใจให้ก่อนนะคะ',
                confidence: 0.81,
                reason: 'grounded_reply',
              }),
            },
          }],
        }),
      }
    },
  })

  try {
    const decision = await ai.draft({ thread, snapshot: service.snapshot(), policy: service.getPolicyForThread(thread) })

    assert.equal(decision.ok, true)
    assert.equal(decision.provider, 'openai')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].body.response_format.type, 'json_schema')
    assert.equal(calls[0].body.response_format.json_schema.strict, true)
    assert.equal(calls[0].body.response_format.json_schema.schema.additionalProperties, false)
    assert.deepEqual(calls[0].body.response_format.json_schema.schema.required, ['draftText', 'confidence', 'reason'])
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = previousKey
  }
})

test('AI reply engine calls Gemini natively for Vercel drafts', async () => {
  const previousKey = process.env.GOOGLE_API_KEY
  process.env.GOOGLE_API_KEY = 'test-gemini-key'
  const calls = []
  const service = createOmniService()
  const thread = service.getThread('thread_1')
  const ai = createAiReplyEngine({
    provider: 'gemini',
    model: 'gemini-3-flash-preview',
    fetchImpl: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) })
      return {
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{ text: 'ได้ค่ะ เดี๋ยวช่วยเช็กสีและไซซ์จากสินค้าที่สนใจให้ก่อนนะคะ ถ้าต้องการไซซ์ M สีดำ เดี๋ยวแอดมินช่วยตรวจสต็อกและราคาที่ถูกต้องให้ค่ะ' }],
            },
          }],
        }),
      }
    },
  })

  try {
    const decision = await ai.draft({ thread, snapshot: service.snapshot(), policy: service.getPolicyForThread(thread) })

    assert.equal(decision.ok, true)
    assert.equal(decision.provider, 'gemini')
    assert.equal(decision.model, 'gemini-3-flash-preview')
    assert.equal(decision.intent, 'stock')
    assert.equal(decision.allowed, true)
    assert.equal(decision.draftText, 'ได้ค่ะ เดี๋ยวช่วยเช็กสีและไซซ์จากสินค้าที่สนใจให้ก่อนนะคะ ถ้าต้องการไซซ์ M สีดำ เดี๋ยวแอดมินช่วยตรวจสต็อกและราคาที่ถูกต้องให้ค่ะ')
    assert.match(calls[0].url, /generativelanguage.googleapis.com/)
    assert.match(calls[0].body.systemInstruction.parts[0].text, /ห้ามแต่งข้อมูล/)
    assert.match(calls[0].body.systemInstruction.parts[0].text, /ช่วยลูกค้าให้ครบก่อน/)
    assert.match(calls[0].body.systemInstruction.parts[0].text, /2-4 ประโยค/)
    assert.match(calls[0].body.systemInstruction.parts[0].text, /ห้ามแทนตัวเองด้วยชื่อผู้ช่วย/)
    assert.match(calls[0].body.systemInstruction.parts[0].text, /origin context/)
    assert.match(calls[0].body.contents[0].parts[0].text, /บริบทที่มาของลูกค้า/)
    assert.match(calls[0].body.contents[0].parts[0].text, /ad_seed_black_m/)
    assert.match(calls[0].body.contents[0].parts[0].text, /เสื้อสีดำ/)
    assert.equal(calls[0].body.generationConfig.temperature, 0.2)
  } finally {
    if (previousKey === undefined) delete process.env.GOOGLE_API_KEY
    else process.env.GOOGLE_API_KEY = previousKey
  }
})

test('AI reply engine falls back when Gemini invents price or stock without source evidence', async () => {
  const previousKey = process.env.GOOGLE_API_KEY
  process.env.GOOGLE_API_KEY = 'test-gemini-key'
  const service = createOmniService()
  const thread = service.getThread('thread_1')
  const ai = createAiReplyEngine({
    provider: 'gemini',
    model: 'gemini-3-flash-preview',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{ text: 'สินค้าพร้อมส่งค่ะ ราคาพิเศษวันนี้ 890 บาท สนใจสั่งซื้อแจ้งได้เลยค่ะ' }],
          },
        }],
      }),
    }),
  })

  try {
    const decision = await ai.draft({ thread, snapshot: service.snapshot(), policy: service.getPolicyForThread(thread) })

    assert.match(decision.draftText, /เช็กสต็อก/)
    assert.doesNotMatch(decision.draftText, /890/)
    assert.doesNotMatch(decision.draftText, /พร้อมส่ง/)
  } finally {
    if (previousKey === undefined) delete process.env.GOOGLE_API_KEY
    else process.env.GOOGLE_API_KEY = previousKey
  }
})

test('SQLite Omni store persists synced Facebook conversations across service instances', () => {
  const dbPath = `${process.cwd()}/.tmp-test/omni-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`
  const firstStore = createSqliteOmniStore({ dbPath })
  const firstService = createOmniService({ store: firstStore })

  firstService.syncFacebookConversations({
    page: { pageId: '189971841184132', pageName: 'MAN KYND', omniPageId: 'page_mankynd' },
    customers: [{ id: 'fb_customer_persist', displayName: 'Persist Customer', platform: 'facebook', providerCustomerId: 'persist', matchConfidence: 1 }],
    threads: [{ id: 'fb_thread_persist', providerThreadId: 't_persist', pageId: 'page_mankynd', platform: 'facebook', customerId: 'fb_customer_persist', status: 'open', intent: 'unknown', risk: 'medium', unreadCount: 1, messageCount: 1, updatedAt: '2026-05-23T00:00:00+0000' }],
    messages: [{ id: 'fb_preview_persist', threadId: 'fb_thread_persist', direction: 'inbound', authorName: 'Persist Customer', text: 'persisted hello', createdAt: '2026-05-23T00:00:00+0000', providerMessageId: 't_persist:snippet' }],
  })
  firstStore.close()

  const secondStore = createSqliteOmniStore({ dbPath })
  const secondService = createOmniService({ store: secondStore })
  const persisted = secondService.getThread('fb_thread_persist')

  assert.equal(persisted.customer.displayName, 'Persist Customer')
  assert.equal(persisted.messages[0].text, 'persisted hello')
  secondStore.close()
})

test('SQLite Omni store backfills missing seed pages for existing databases', () => {
  const dbPath = `${process.cwd()}/.tmp-test/omni-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`
  const initialSeed = createOmniSeed()
  initialSeed.pages = initialSeed.pages.filter((page) => page.id !== 'page_fb_112154661515664')
  initialSeed.platformAccounts = initialSeed.platformAccounts.filter((account) => account.id !== 'acct_fb_112154661515664')

  const firstStore = createSqliteOmniStore({ dbPath, seed: initialSeed })
  assert.equal(firstStore.snapshot().pages.some((page) => page.id === 'page_fb_112154661515664'), false)
  firstStore.close()

  const migratedStore = createSqliteOmniStore({ dbPath, seed: createOmniSeed() })
  const snapshot = migratedStore.snapshot()

  assert.equal(snapshot.pages.some((page) => page.id === 'page_fb_112154661515664'), true)
  assert.equal(snapshot.platformAccounts.some((account) => account.id === 'acct_fb_112154661515664'), true)
  migratedStore.close()
})

test('SQLite Omni store removes deprecated seed pages and updates seed names', () => {
  const dbPath = `${process.cwd()}/.tmp-test/omni-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`
  const legacySeed = createOmniSeed()
  legacySeed.pages.push(
    { id: 'page_shop_4', name: 'Seed Page 4', status: 'active', brandGroupId: 'brand_shared', policySetId: 'policy_default', agentProfileId: 'agent_default' },
    { id: 'page_shop_5', name: 'Seed Page 5', status: 'active', brandGroupId: 'brand_shared', policySetId: 'policy_default', agentProfileId: 'agent_default' },
  )
  legacySeed.pages = legacySeed.pages.map((page) => (
    page.id === 'page_fb_112154661515664' ? { ...page, name: 'Facebook Page 112154661515664' } : page
  ))

  const legacyStore = createSqliteOmniStore({ dbPath, seed: legacySeed })
  assert.equal(legacyStore.snapshot().pages.some((page) => page.id === 'page_shop_4'), true)
  assert.equal(legacyStore.snapshot().pages.find((page) => page.id === 'page_fb_112154661515664').name, 'Facebook Page 112154661515664')
  legacyStore.close()

  const migratedStore = createSqliteOmniStore({ dbPath, seed: createOmniSeed() })
  const pages = migratedStore.snapshot().pages

  assert.equal(pages.some((page) => page.id === 'page_shop_4'), false)
  assert.equal(pages.some((page) => page.id === 'page_shop_5'), false)
  assert.equal(pages.find((page) => page.id === 'page_fb_112154661515664').name, 'Viris Zamara')
  migratedStore.close()
})

test('SQLite Omni store separates Anna Lynn Facebook and AnnaLynn TikTok source pages', () => {
  const dbPath = `${process.cwd()}/.tmp-test/omni-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`
  const legacySeed = createOmniSeed()
  legacySeed.pages = legacySeed.pages.filter((page) => page.id !== 'page_annalynn_tiktok')
  legacySeed.platformAccounts = legacySeed.platformAccounts
    .filter((account) => account.id !== 'acct_fb_annalynn')
    .map((account) => account.id === 'acct_tt_shop' ? { ...account, pageId: 'page_annalynn' } : account)
  legacySeed.threads = legacySeed.threads.map((thread) => thread.id === 'thread_2' ? { ...thread, pageId: 'page_annalynn' } : thread)

  const legacyStore = createSqliteOmniStore({ dbPath, seed: legacySeed })
  legacyStore.close()

  const migratedStore = createSqliteOmniStore({ dbPath, seed: createOmniSeed() })
  const snapshot = migratedStore.snapshot()

  assert.equal(snapshot.pages.find((page) => page.id === 'page_annalynn').name, 'Anna Lynn')
  assert.equal(snapshot.pages.find((page) => page.id === 'page_annalynn_tiktok').name, 'AnnaLynn')
  assert.equal(snapshot.platformAccounts.find((account) => account.id === 'acct_fb_annalynn').platform, 'facebook')
  assert.equal(snapshot.platformAccounts.find((account) => account.id === 'acct_tt_shop').pageId, 'page_annalynn_tiktok')
  assert.equal(snapshot.threads.find((thread) => thread.id === 'thread_2').pageId, 'page_annalynn_tiktok')
  migratedStore.close()
})

test('SQLite Omni store preserves customized chat retention policy across restarts', () => {
  const dbPath = `${process.cwd()}/.tmp-test/omni-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`
  const firstStore = createSqliteOmniStore({ dbPath })
  const firstService = createOmniService({ store: firstStore })
  firstService.upsertRetentionPolicy({ deleteAfterDays: 90, enabled: false })
  firstStore.close()

  const secondStore = createSqliteOmniStore({ dbPath })
  const secondService = createOmniService({ store: secondStore })
  const policy = secondService.listRetentionPolicies().find((item) => item.id === 'retention_chat_messages')

  assert.equal(policy.deleteAfterDays, 90)
  assert.equal(policy.enabled, false)
  secondStore.close()
})

test('normalizes TikTok orders into Omni customers and orders', () => {
  const normalized = normalizeTikTokOrders({
    code: 0,
    data: {
      total_count: 1,
      orders: [{
        id: '584032386060683081',
        user_id: '7494557570104855369',
        status: 'AWAITING_COLLECTION',
        tracking_number: '796906652754',
        create_time: 1778812319,
        update_time: 1778815864,
        payment_method_name: 'Mbanking',
        payment: { total_amount: '841.5', currency: 'THB' },
        recipient_address: { name: 'เ***จา พ***์โภสคราม', phone_number: '(+66)080*****42' },
        line_items: [{
          id: 'line_1',
          product_name: 'Lorra เดรสเชิ้ต Polo',
          sku_name: 'สีเทา, XL',
          seller_sku: 'lorสีเทาXL',
          sale_price: '841.5',
          tracking_number: '796906652754',
        }],
      }],
    },
  })

  assert.equal(normalized.orders[0].id, 'tt_order_584032386060683081')
  assert.equal(normalized.orders[0].total, 841.5)
  assert.equal(normalized.orders[0].itemSummary[0].sellerSku, 'lorสีเทาXL')
  assert.equal(normalized.customers[0].id, 'tt_customer_7494557570104855369')
})

test('TikTok order connector calls finance helper through injectable runner', async () => {
  const calls = []
  const result = await listTikTokOrders({
    status: 'AWAITING_COLLECTION',
    pageSize: 2,
    runner: async (args) => {
      calls.push(args)
      return { code: 0, data: { orders: [], total_count: 0, next_page_token: '' } }
    },
  })

  assert.deepEqual(calls[0], ['orders', '--status', 'AWAITING_COLLECTION', '--page-size', '2'])
  assert.equal(result.source, 'tiktok_shop')
  assert.deepEqual(result.orders, [])
})

test('omni service syncs normalized TikTok orders into memory store', () => {
  const service = createOmniService()
  const result = service.syncTikTokOrders({
    source: 'tiktok_shop',
    totalCount: 1,
    nextPageToken: '',
    customers: [{ id: 'tt_customer_1', displayName: 'TikTok Customer', platform: 'tiktok', providerCustomerId: '1', matchConfidence: 1 }],
    orders: [{ id: 'tt_order_1', customerId: 'tt_customer_1', platform: 'tiktok', providerOrderId: '1', status: 'AWAITING_COLLECTION', total: 841.5, currency: 'THB' }],
  })

  assert.equal(result.customers.inserted, 1)
  assert.equal(result.orders.inserted, 1)
  assert.equal(service.snapshot().orders.find((order) => order.id === 'tt_order_1').total, 841.5)
})

test('omni service syncs normalized EasyStore webhook rows into memory store', () => {
  const service = createOmniService()
  const normalized = normalizeEasyStoreWebhookPayload({
    id: 11002,
    order_number: 'AL-1002',
    total_price: '890.00',
    currency: 'THB',
    customer: { id: 502, name: 'Easy Customer', phone: '0899999999' },
  }, { topic: 'order/create', shopDomain: 'annalynna.easy.co' })

  const result = service.syncEasyStoreWebhookEvents(normalized)

  assert.equal(result.customers.inserted, 1)
  assert.equal(result.threads.inserted, 1)
  assert.equal(result.messages.inserted, 1)
  assert.equal(result.orders.inserted, 1)
  assert.equal(service.snapshot().orders.find((order) => order.id === 'es_order_11002').total, 890)
})

test('TikTok order route rejects unknown status before helper mutation', async () => {
  const app = express()
  app.use(express.json())
  mountRoutes(app, { broadcast() {} }, { snapshot() { return {} } })

  const server = app.listen(0)
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`
    const response = await fetch(`${baseUrl}/api/omni/tiktok/orders?status=UNKNOWN`)
    const body = await response.json()

    assert.equal(response.status, 400)
    assert.equal(body.ok, false)
    assert.match(body.error, /unknown_tiktok_order_status/)
  } finally {
    server.close()
  }
})

test('omni database schema includes durable memory tables and guards', () => {
  const sql = loadOmniSchemaSql()
  const summary = getOmniSchemaSummary()

  for (const table of REQUIRED_OMNI_TABLES) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`))
  }

  assert.equal(summary.dialect, 'sqlite_first_postgres_compatible')
  assert.equal(summary.hasPaymentApprovalGuard, true)
  assert.equal(summary.hasAuditLog, true)
  assert.equal(summary.hasSourceRefs, true)
  assert.equal(summary.hasChatRetention, true)
  assert.equal(summary.preservesCustomerContacts, true)
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_messages_thread_created/)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS retention_policies/)
})

test('sendInstagramCommentReply calls direct Graph API when no runner and token exists', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: url.toString(), opts })
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: 'ig_reply_direct_1' }),
    }
  }
  try {
    process.env.META_PAGE_TOKEN_IG_ANNA_LYNN = 'test_ig_token_direct'
    const result = await sendInstagramCommentReply({ pageProfile: 'ig_anna_lynn', commentId: 'ig_c_direct_1', message: 'ขอบคุณค่ะ' })
    assert.equal(result.ok, true)
    assert.equal(result.response.id, 'ig_reply_direct_1')
    assert.equal(calls.length, 1)
    assert.match(calls[0].url, /graph\.instagram\.com/)
    assert.match(calls[0].url, /replies/)
    assert.match(calls[0].url, /access_token=test_ig_token_direct/)
    const body = JSON.parse(calls[0].opts.body)
    assert.equal(body.message, 'ขอบคุณค่ะ')
  } finally {
    delete process.env.META_PAGE_TOKEN_IG_ANNA_LYNN
    globalThis.fetch = originalFetch
  }
})

test('sendInstagramCommentReply returns ig_page_token_missing when no IG token set', async () => {
  const saved = process.env.META_PAGE_TOKEN_IG_ANNA_LYNN
  delete process.env.META_PAGE_TOKEN_IG_ANNA_LYNN
  delete process.env.META_IG_ACCESS_TOKEN
  try {
    const result = await sendInstagramCommentReply({ pageProfile: 'ig_anna_lynn', commentId: 'ig_c_2', message: 'test' })
    assert.equal(result.ok, false)
    assert.equal(result.error, 'ig_page_token_missing')
    assert.equal(result.pageProfile, 'ig_anna_lynn')
    assert.ok(Array.isArray(result.expectedEnv))
  } finally {
    if (saved) process.env.META_PAGE_TOKEN_IG_ANNA_LYNN = saved
  }
})

test('sendInstagramCommentReply uses runner when provided (backward compat)', async () => {
  const calls = []
  const mockRunner = async (args) => {
    calls.push(args)
    return { ok: true, response: { id: 'runner_ig_reply_1' } }
  }
  const result = await sendInstagramCommentReply({
    pageProfile: 'ig_anna_lynn',
    commentId: 'ig_c_runner_1',
    message: 'สวัสดีค่ะ',
    runner: mockRunner,
  })
  assert.equal(result.ok, true)
  assert.equal(result.response.id, 'runner_ig_reply_1')
  assert.equal(calls[0][0], 'reply-ig-comment')
  assert.equal(calls[0][2], '--comment-id=ig_c_runner_1')
})
