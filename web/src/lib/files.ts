export async function readFileAsText(file: File): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`Failed reading file: ${file.name}`))
    reader.onabort = () => reject(new Error(`Aborted reading file: ${file.name}`))
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.readAsText(file)
  })
}

