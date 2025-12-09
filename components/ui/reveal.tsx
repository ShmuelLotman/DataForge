'use client'

import { motion, useAnimation, useInView, Variant } from 'framer-motion'
import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

interface RevealProps {
  children: React.ReactNode
  width?: 'fit-content' | '100%'
  className?: string
  delay?: number
  duration?: number
  variant?: 'fade' | 'slide' | 'scale' | 'blur'
}

export const Reveal = ({
  children,
  width = 'fit-content',
  className,
  delay = 0.25,
  duration = 0.5,
  variant = 'slide',
}: RevealProps) => {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true })
  const mainControls = useAnimation()

  useEffect(() => {
    if (isInView) {
      mainControls.start('visible')
    }
  }, [isInView, mainControls])

  const variants: Record<string, { hidden: Variant; visible: Variant }> = {
    fade: {
      hidden: { opacity: 0 },
      visible: { opacity: 1 },
    },
    slide: {
      hidden: { opacity: 0, y: 20 },
      visible: { opacity: 1, y: 0 },
    },
    scale: {
      hidden: { opacity: 0, scale: 0.95 },
      visible: { opacity: 1, scale: 1 },
    },
    blur: {
        hidden: { opacity: 0, filter: 'blur(10px)' },
        visible: { opacity: 1, filter: 'blur(0px)' },
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative', width }} className={className}>
      <motion.div
        variants={variants[variant]}
        initial="hidden"
        animate={mainControls}
        transition={{ duration, delay, ease: [0.21, 0.47, 0.32, 0.98] }} // Custom easing
      >
        {children}
      </motion.div>
    </div>
  )
}

