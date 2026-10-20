import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/')({
  component: Home,
})

function Home() {
  return (
    <main className="p-8">
      <h1 className="text-4xl font-bold">Riptide</h1>
      <p className="mt-2">Real-time host monitoring.</p>
    </main>
  )
}
