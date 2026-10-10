import { removeBackground } from '@imgly/background-removal-node'

let lastProgress = 0

function sendProgress(stage, progress) {
  if (progress === lastProgress) return
  lastProgress = progress
  process.send({ stage, progress })
}

process.on('message', async ({ image, type }) => {
  try {
    const blob = await removeBackground(new Blob([image], { type }), {
      model: 'medium',
      progress: (key, current, total) => {
        if (key.startsWith('fetch')) sendProgress('Loading model', 10 + Math.round((current / total) * 30))
        else if (current < total) sendProgress('Removing background', 50)
        else sendProgress('Saving result', 90)
      },
    })
    const result = Buffer.from(await blob.arrayBuffer())
    process.send({ result }, () => process.exit())
  } catch (err) {
    process.send({ error: err.message }, () => process.exit())
  }
})
