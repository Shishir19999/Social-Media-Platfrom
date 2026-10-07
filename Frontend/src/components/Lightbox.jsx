import { useEffect, useState } from 'react'
import Modal from './Modal'
import Icon from './Icon'

export default function Lightbox({ images, start = 0, onClose }) {
  const [i, setI] = useState(start)
  const many = images.length > 1
  const count = images.length

  useEffect(() => {
    if (count < 2) return undefined
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') setI((n) => (n - 1 + count) % count)
      if (e.key === 'ArrowRight') setI((n) => (n + 1) % count)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [count])

  const go = (d) => setI((n) => (n + d + count) % count)

  return (
    <Modal title={`Image ${i + 1} of ${count}`} onClose={onClose} size="lg" className="lightbox" hideTitle closeLabel="Close image viewer">
      <div className="lightbox-stage">
        {many && <button type="button" className="icon-btn lb-nav lb-prev" aria-label="Previous image" onClick={() => go(-1)}><Icon name="chevronLeft" /></button>}
        <img src={images[i]} alt={`Attached image ${i + 1} of ${count}`} />
        {many && <button type="button" className="icon-btn lb-nav lb-next" aria-label="Next image" onClick={() => go(1)}><Icon name="chevronRight" /></button>}
      </div>
      {many && <p className="lb-count" aria-live="polite">{i + 1} / {count}</p>}
    </Modal>
  )
}
