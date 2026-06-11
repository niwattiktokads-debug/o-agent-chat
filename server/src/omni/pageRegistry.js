import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const FALLBACK_PAGE_PROFILES = {
  man_kynd: { profileKey: 'man_kynd', pageId: '189971841184132', pageName: 'MAN KYND', omniPageId: 'page_mankynd', platform: 'facebook' },
  anna_lynn: { profileKey: 'anna_lynn', pageId: '122106446570001676', pageName: 'Anna Lynn', omniPageId: 'page_annalynn', platform: 'facebook' },
  page_des: { profileKey: 'page_des', pageId: '1137894522741329', pageName: 'Niwatha และ AI ชื่อเดส', omniPageId: 'page_des', platform: 'facebook' },
  tangtob: { profileKey: 'tangtob', pageId: '106740601303449', pageName: 'ละครแนวตั้งตบ', omniPageId: 'page_tangtob', platform: 'facebook' },
  fb_112154661515664: { profileKey: 'fb_112154661515664', pageId: '112154661515664', pageName: 'VZ by viris zamara. (ชมพู)', omniPageId: 'page_fb_112154661515664', platform: 'facebook' },
  ig_anna_lynn: { profileKey: 'ig_anna_lynn', pageId: '17841456216401165', pageName: 'Anna Lynn IG', omniPageId: 'page_ig_annalynn', platform: 'instagram' },
  ig_man_kynd: { profileKey: 'ig_man_kynd', pageId: '17841402222436331', pageName: 'MAN KYND IG', omniPageId: 'page_ig_mankynd', platform: 'instagram' },
  ig_page_des: { profileKey: 'ig_page_des', pageId: 'NOT_LINKED', pageName: 'Niwatha และ AI ชื่อเดส IG', omniPageId: 'page_ig_page_des', platform: 'instagram' },
  ig_fb_112154661515664: { profileKey: 'ig_fb_112154661515664', pageId: '17841462136286560', pageName: 'Viris Zamara IG', omniPageId: 'page_ig_fb_112154661515664', platform: 'instagram' },
  vz_viris_zamara: { profileKey: 'vz_viris_zamara', pageId: '112979362131792', pageName: 'VZ by viris zamara. (น้ำตาล)', omniPageId: 'page_vz_viris_zamara', platform: 'facebook' },
  ig_vz_viris_zamara: { profileKey: 'ig_vz_viris_zamara', pageId: '17841400330305192', pageName: 'VZ by viris zamara. IG', omniPageId: 'page_ig_vz_viris_zamara', platform: 'instagram' },
}

const DEFAULT_REGISTRY_PATH = fileURLToPath(new URL('../../data/pages.json', import.meta.url))

function registryPath(inputPath = process.env.OMNI_PAGE_REGISTRY_PATH) {
  return resolve(inputPath || DEFAULT_REGISTRY_PATH)
}

function normalizeRegistryRow(input = {}) {
  const profileKey = String(input.profileKey || '').trim()
  const pageId = String(input.pageId || '').trim()
  const pageName = String(input.pageName || '').trim()
  const omniPageId = String(input.omniPageId || '').trim()
  const platform = String(input.platform || 'facebook').trim()
  if (!profileKey) throw new Error('profile_key_required')
  if (!pageId) throw new Error('page_id_required')
  if (!pageName) throw new Error('page_name_required')
  if (!omniPageId) throw new Error('omni_page_id_required')
  return { profileKey, pageId, pageName, omniPageId, platform }
}

function readRegistryRows(path) {
  if (!existsSync(path)) return []
  const rows = JSON.parse(readFileSync(path, 'utf8'))
  if (!Array.isArray(rows)) throw new Error('page_registry_must_be_array')
  return rows.map(normalizeRegistryRow)
}

export function defaultPageRegistryPath() {
  return registryPath()
}

export function loadPageRegistry({ registryPath: inputPath } = {}) {
  const profiles = new Map()
  for (const row of Object.values(FALLBACK_PAGE_PROFILES)) {
    const normalized = normalizeRegistryRow(row)
    profiles.set(normalized.profileKey, normalized)
  }
  for (const row of readRegistryRows(registryPath(inputPath))) {
    profiles.set(row.profileKey, row)
  }
  return Object.fromEntries(profiles)
}

export function listProfiles(options = {}) {
  return Object.values(loadPageRegistry(options))
}

export function getProfile(pageId, options = {}) {
  const target = String(pageId || '')
  return listProfiles(options).find((profile) => profile.pageId === target) || null
}

export function getProfileKeyForOmniPage(omniPageId, options = {}) {
  const target = String(omniPageId || '')
  return listProfiles(options).find((profile) => profile.omniPageId === target)?.profileKey || null
}

export function appendPageRegistryEntry(input = {}, { registryPath: inputPath } = {}) {
  const path = registryPath(inputPath)
  const row = normalizeRegistryRow(input)
  const rows = readRegistryRows(path)
  const existing = loadPageRegistry({ registryPath: path })
  if (existing[row.profileKey]) throw new Error('profile_key_exists')
  if (Object.values(existing).some((item) => item.pageId === row.pageId)) throw new Error('page_id_exists')
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify([...rows, row], null, 2)}\n`)
  return { ok: true, page: row, registry: listProfiles({ registryPath: path }), path }
}
