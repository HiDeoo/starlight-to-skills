import type { APIRoute, GetStaticPaths } from 'astro'
import skills from 'virtual:starlight-to-skills/skills'

import { makeDiscoveryRoute } from '../libs/discovery'

const route = makeDiscoveryRoute(skills, import.meta.env.DEV)

export const prerender = true

export const getStaticPaths: GetStaticPaths = route.getStaticPaths

export const GET: APIRoute = route.GET
