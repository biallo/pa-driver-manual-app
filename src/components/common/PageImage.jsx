import { assetUrl, withVersion } from '../../lib/assets'

export default function PageImage({ image, version, alt }) {
  if (!image) return null

  return (
    <img
      className="question-page-img"
      src={assetUrl(withVersion(image, version))}
      alt={alt || 'Question illustration'}
      onError={(e) => {
        e.currentTarget.style.display = 'none'
      }}
    />
  )
}
