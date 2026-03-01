import { assetUrl, withVersion } from '../../lib/assets'

export default function PageImage({ image, version }) {
  if (!image) return null
  return (
    <img
      className="question-page-img"
      src={assetUrl(withVersion(image, version))}
      alt="题目配图"
      onError={(e) => {
        e.currentTarget.style.display = 'none'
      }}
    />
  )
}
