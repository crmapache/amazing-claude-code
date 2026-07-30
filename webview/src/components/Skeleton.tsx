import s from './shell.module.css'

interface SkeletonBarProps {
  width: string | number
  height?: number
  /** Для точки статуса — кружок, а не скруглённый прямоугольник. */
  round?: boolean
}

/**
 * Заглушка на месте текста/кнопки, пока данные ещё не пришли — тем же
 * дыханием (acc-pulse), что и у рабочей точки вкладки. Нужна, чтобы модалка
 * сразу занимала примерно ту же высоту, что и с настоящими данными: без неё
 * список появляется пустым и высота дёргается, когда ответ наконец приходит.
 */
export const SkeletonBar = ({ width, height = 11, round }: SkeletonBarProps) => (
  <span className={s.skeletonBar} style={{ width, height, borderRadius: round ? '50%' : undefined }} />
)
