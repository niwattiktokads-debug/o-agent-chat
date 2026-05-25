import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const DEFAULT_HELPER = process.env.TIKTOK_FINANCE_HELPER || join(homedir(), '.claude/skills/nosuda-tiktok-finance/tiktok_api.py')
export const TIKTOK_ORDER_STATUSES = ['AWAITING_COLLECTION', 'AWAITING_SHIPMENT', 'COMPLETED']

async function defaultRunner(args) {
  const { stdout } = await execFileAsync('python3', [DEFAULT_HELPER, ...args], {
    maxBuffer: 1024 * 1024 * 16,
    env: process.env,
  })
  return JSON.parse(stdout)
}

function toNumber(value) {
  const number = Number(value || 0)
  return Number.isFinite(number) ? number : 0
}

function toIsoFromSeconds(value) {
  if (!value) return null
  return new Date(Number(value) * 1000).toISOString()
}

function summarizeItems(lineItems = []) {
  return lineItems.map((item) => ({
    id: item.id,
    productName: item.product_name,
    skuName: item.sku_name,
    sellerSku: item.seller_sku,
    salePrice: toNumber(item.sale_price),
    trackingNumber: item.tracking_number || null,
  }))
}

export function normalizeTikTokOrders(response) {
  const orders = response?.data?.orders || []
  const customers = []
  const normalizedOrders = []

  for (const order of orders) {
    const customerId = `tt_customer_${order.user_id || order.id}`
    const recipient = order.recipient_address || {}
    const total = toNumber(order.payment?.total_amount)
    const currency = order.payment?.currency || 'THB'

    customers.push({
      id: customerId,
      displayName: recipient.name || 'TikTok Customer',
      platform: 'tiktok',
      providerCustomerId: order.user_id || null,
      phone: recipient.phone_number || null,
      note: recipient.district_info?.map((item) => item.address_name).filter(Boolean).join(', ') || '',
      matchConfidence: order.user_id ? 1 : 0.4,
      sourceRef: `tiktok_order:${order.id}`,
    })

    normalizedOrders.push({
      id: `tt_order_${order.id}`,
      customerId,
      platform: 'tiktok',
      providerOrderId: order.id,
      status: order.status,
      total,
      totalAmount: total,
      currency,
      tracking: order.tracking_number || null,
      trackingCode: order.tracking_number || null,
      itemSummary: summarizeItems(order.line_items),
      paymentMethod: order.payment_method_name || '',
      sourceRef: `tiktok_order:${order.id}`,
      createdAt: toIsoFromSeconds(order.create_time),
      updatedAt: toIsoFromSeconds(order.update_time) || toIsoFromSeconds(order.create_time),
    })
  }

  return {
    source: 'tiktok_shop',
    totalCount: response?.data?.total_count || normalizedOrders.length,
    nextPageToken: response?.data?.next_page_token || '',
    customers,
    orders: normalizedOrders,
  }
}

export async function listTikTokOrders({ status = 'AWAITING_COLLECTION', pageSize = 10, runner = defaultRunner } = {}) {
  if (!TIKTOK_ORDER_STATUSES.includes(status)) throw new Error(`unknown_tiktok_order_status:${status}`)
  const payload = await runner(['orders', '--status', status, '--page-size', String(pageSize)])
  if (payload?.code !== 0) throw new Error(payload?.message || 'tiktok_orders_failed')
  return normalizeTikTokOrders(payload)
}
