import type { APIRoute, GetStaticPaths } from 'astro'
import { root } from 'astro:config/server'

import { makeDiscoveryRoute } from './libs/discovery'

const route = makeDiscoveryRoute(root, import.meta.env.DEV)

export const prerender = true

export const getStaticPaths: GetStaticPaths = route.getStaticPaths

export const GET: APIRoute = route.GET
