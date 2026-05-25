package com.portionspot.pos

import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import kotlin.math.sqrt

/**
 * Fires [onShake] after [shakeCount] distinct shakes within [windowMs] milliseconds.
 * Register/unregister with SensorManager in onResume/onPause.
 */
class ShakeDetector(
    private val threshold:  Float = 14f,   // m/s² above gravity
    private val shakeCount: Int   = 3,
    private val windowMs:   Long  = 1_200,
    private val onShake:    () -> Unit,
) : SensorEventListener {

    private var count         = 0
    private var windowStart   = 0L
    private var lastShakeMs   = 0L
    private val MIN_INTERVAL  = 250L       // ignore bounces faster than 250 ms

    override fun onSensorChanged(event: SensorEvent) {
        if (event.sensor.type != Sensor.TYPE_ACCELEROMETER) return

        val x = event.values[0]
        val y = event.values[1]
        val z = event.values[2]
        val accel = sqrt(x * x + y * y + z * z) - SensorManager.GRAVITY_EARTH

        if (accel > threshold) {
            val now = System.currentTimeMillis()
            if (now - lastShakeMs < MIN_INTERVAL) return
            lastShakeMs = now

            if (count == 0 || now - windowStart > windowMs) {
                count       = 1
                windowStart = now
            } else {
                count++
                if (count >= shakeCount) {
                    count = 0
                    onShake()
                }
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor, accuracy: Int) = Unit
}
