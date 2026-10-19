import { workAsyncStorage } from '../app-render/work-async-storage.external'
import { workUnitAsyncStorage } from '../app-render/work-unit-async-storage.external'
import type { SyncIOApiType } from '../app-render/sync-io-messages'
import { InvariantError } from '../../shared/lib/invariant-error'

// These modules are only needed while rendering, so they are loaded on first
// use instead of when the node environment is installed. This keeps them (and
// everything they import) out of the cold start of functions that never
// render, like proxy.ts and route handlers.
let renderingModules:
  | {
      abortOnSynchronousPlatformIOAccess: typeof import('../app-render/dynamic-rendering').abortOnSynchronousPlatformIOAccess
      RenderStage: typeof import('../app-render/staged-rendering').RenderStage
      applyOwnerStack: typeof import('../dynamic-rendering-utils').applyOwnerStack
      syncIOMessages: typeof import('../app-render/sync-io-messages')
    }
  | undefined

function getRenderingModules() {
  if (renderingModules === undefined) {
    renderingModules = {
      abortOnSynchronousPlatformIOAccess: (
        require('../app-render/dynamic-rendering') as typeof import('../app-render/dynamic-rendering')
      ).abortOnSynchronousPlatformIOAccess,
      RenderStage: (
        require('../app-render/staged-rendering') as typeof import('../app-render/staged-rendering')
      ).RenderStage,
      applyOwnerStack: (
        require('../dynamic-rendering-utils') as typeof import('../dynamic-rendering-utils')
      ).applyOwnerStack,
      syncIOMessages:
        require('../app-render/sync-io-messages') as typeof import('../app-render/sync-io-messages'),
    }
  }
  return renderingModules
}

export function io(expression: string, type: SyncIOApiType) {
  const workUnitStore = workUnitAsyncStorage.getStore()
  const workStore = workAsyncStorage.getStore()

  if (!workUnitStore || !workStore) {
    return
  }

  const {
    abortOnSynchronousPlatformIOAccess,
    RenderStage,
    applyOwnerStack,
    syncIOMessages: {
      createSyncIOClientError,
      createSyncIOError,
      createSyncIORuntimeError,
    },
  } = getRenderingModules()

  switch (workUnitStore.type) {
    case 'prerender':
    case 'prerender-runtime': {
      const prerenderSignal = workUnitStore.controller.signal

      if (prerenderSignal.aborted === false) {
        // If the prerender signal is already aborted we don't need to construct
        // any stacks because something else actually terminated the prerender.
        // TODO: synchronize this with `stageController`
        abortOnSynchronousPlatformIOAccess(
          workStore.route,
          expression,
          applyOwnerStack(createSyncIOError(workStore.route, expression, type)),
          workUnitStore
        )
      }
      break
    }
    case 'prerender-client': {
      const prerenderSignal = workUnitStore.controller.signal

      if (prerenderSignal.aborted === false) {
        // If the prerender signal is already aborted we don't need to construct
        // any stacks because something else actually terminated the prerender.
        abortOnSynchronousPlatformIOAccess(
          workStore.route,
          expression,
          applyOwnerStack(
            createSyncIOClientError(workStore.route, expression, type)
          ),
          workUnitStore
        )
      }
      break
    }
    case 'request': {
      const stageController = workUnitStore.stagedRendering
      if (stageController && stageController.shouldTrackSyncInterrupt()) {
        let syncIOError: Error
        // NOTE: keep stages where we can interrupt in sync with
        // `shouldTrackSyncInterrupt`/`syncInterruptCurrentStageWithReason`
        switch (stageController.currentStage) {
          case RenderStage.ShellStatic:
          case RenderStage.PrefetchStatic_prefetchApi:
          case RenderStage.PrefetchStatic:
          case RenderStage.NavigationStatic:
          case RenderStage.Static: {
            syncIOError = createSyncIOError(workStore.route, expression, type)
            break
          }
          case RenderStage.ShellRuntime:
          case RenderStage.PrefetchRuntime_prefetchApi:
          case RenderStage.PrefetchRuntime:
          case RenderStage.NavigationRuntime: {
            // We're in a runtime stage.
            // We only error for Sync IO in runtime stages if the route has partialPrefetching enabled.
            syncIOError = createSyncIORuntimeError(
              workStore.route,
              expression,
              type
            )
            break
          }
          case RenderStage.Before:
          case RenderStage.Dynamic:
          case RenderStage.Abandoned: {
            throw new InvariantError(
              `shouldTrackSyncInterrupt allowed a sync IO interrupt in an unexpected stage: ${RenderStage[stageController.currentStage]}`
            )
          }
        }

        syncIOError = applyOwnerStack(syncIOError)
        stageController.syncInterruptCurrentStageWithReason(syncIOError)

        // A validation render uses a 'request' store type, but may be abortable.
        // If we're rendering with filled caches, Sync IO is an error and should trigger an abort.
        if (
          workUnitStore.controller &&
          !workUnitStore.controller.signal.aborted
        ) {
          workUnitStore.controller.abort(syncIOError)
        }
      }
      break
    }
    case 'validation-client':
    case 'prerender-legacy':
    case 'cache':
    case 'private-cache':
    case 'unstable-cache':
    case 'build-time-generator':
      break
    default:
      workUnitStore satisfies never
  }
}
