import { createRouter, createWebHistory } from 'vue-router'
import { features } from '@features/registry'

/**
 * Router собирает маршруты ДИНАМИЧЕСКИ из Feature Registry.
 *
 * Не нужно вручную описывать routes — каждая фича приносит свой route.
 */
const router = createRouter({
  history: createWebHistory(),
  routes: [
    /* Redirect root → first feature */
    {
      path: '/',
      redirect: features.length > 0 ? (features[0].route.path as string) : '/dashboard',
    },

    /* Feature routes — auto-registered */
    ...features.flatMap((f) => (f.routes ? f.routes : [f.route])),

    /* 404 catch-all */
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@shared/ui/NotFoundPage.vue'),
    },
  ],
})

export default router
