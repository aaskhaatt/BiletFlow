import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

// The shadcn/ui primitives of W1.14 in our tokens. W2 turns them into the full UI kit.
export default function PrimitivesSection() {
  return (
    <section className="space-y-6" data-testid="primitives">
      <h2 className="type-card-title">Primitives</h2>

      <Tabs defaultValue="upcoming" className="max-w-md">
        <TabsList>
          <TabsTrigger value="upcoming">Предстоящие · 2</TabsTrigger>
          <TabsTrigger value="past">Прошедшие</TabsTrigger>
        </TabsList>
        <TabsContent value="upcoming">Предстоящие события</TabsContent>
        <TabsContent value="past">Прошедшие события</TabsContent>
      </Tabs>

      <div className="flex flex-wrap gap-3">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">Открыть диалог</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Вернуть деньги?</DialogTitle>
              <DialogDescription>
                Действие необратимо: билеты станут недействительными.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Отмена</Button>
              </DialogClose>
              <Button variant="destructive">Вернуть</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Button variant="outline" onClick={() => toast.success('Билет добавлен')}>
          Показать toast
        </Button>
      </div>
    </section>
  )
}
