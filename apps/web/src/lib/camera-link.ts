import type { Vec3 } from "@/types"

export interface CameraState {
	position: Vec3
	target: Vec3
}

export type PlaybackEvent =
	| { kind: "play"; time: number }
	| { kind: "pause"; time: number }
	| { kind: "seek"; time: number }
	| { kind: "rate"; rate: number }

export interface SyncChannel<T> {
	publish: (source: string, state: T) => void
	subscribe: (source: string, listener: (state: T) => void) => () => void
}

export type CameraLink = SyncChannel<CameraState>

export type PlaybackLink = SyncChannel<PlaybackEvent>

export const createSyncChannel = <T>(): SyncChannel<T> => {
	const listeners = new Map<string, (state: T) => void>()
	return {
		publish: (source, state) => {
			listeners.forEach((listener, owner) => {
				if (owner !== source) listener(state)
			})
		},
		subscribe: (source, listener) => {
			listeners.set(source, listener)
			return () => {
				if (listeners.get(source) === listener) listeners.delete(source)
			}
		},
	}
}

export const createCameraLink = (): CameraLink => createSyncChannel<CameraState>()

export const createPlaybackLink = (): PlaybackLink => createSyncChannel<PlaybackEvent>()
