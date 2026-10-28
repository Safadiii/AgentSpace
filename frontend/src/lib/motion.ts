/** Motion primitives shared by every interactive surface.
 *  Springs, not durations: they start from the current value, so any animation can be interrupted and redirected. */
export const SPRING = { type: 'spring', bounce: 0, duration: 0.4 } as const          // default: critically damped, no overshoot
export const SPRING_QUICK = { type: 'spring', bounce: 0, duration: 0.3 } as const
export const SPRING_MOMENTUM = { type: 'spring', bounce: 0.2, duration: 0.4 } as const // only when a gesture carried momentum

/** Where a flick would come to rest (exponential deceleration, as scroll views do). Velocity in px/s. */
export function project(velocity: number, decelerationRate = 0.998) {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate)
}

/** Progressive resistance past a boundary: the further you pull, the less the element follows. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot))
}
