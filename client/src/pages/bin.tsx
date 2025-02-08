import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContentArea } from "@/components/ui/content-area";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { db, Page, Task } from "@/lib/db";
import { useToast } from "@/hooks/use-toast";

export default function Bin() {
  const [deletedPages, setDeletedPages] = useState<Page[]>([]);
  const [deletedTasks, setDeletedTasks] = useState<Task[]>([]);
  const { toast } = useToast();

  const loadDeletedItems = async () => {
    const pages = await db.pages
      .where("isDeleted")
      .equals(1)
      .reverse()
      .toArray();

    const tasks = await db.tasks
      .where("isDeleted")
      .equals(1)
      .reverse()
      .toArray();

    setDeletedPages(pages);
    setDeletedTasks(tasks);
  };

  useEffect(() => {
    loadDeletedItems();
  }, []);

  const restorePage = async (page: Page) => {
    await db.pages.update(page.id!, { isDeleted: false });
    await db.addHistoryEntry("restore_page", `Restored page: ${page.name}`);
    loadDeletedItems();

    toast({
      title: "Page restored",
      description: "The page has been restored successfully."
    });
  };

  const restoreTask = async (task: Task) => {
    await db.tasks.update(task.id!, { isDeleted: false });
    await db.addHistoryEntry("restore_task", `Restored task: ${task.title}`);
    loadDeletedItems();

    toast({
      title: "Task restored",
      description: "The task has been restored successfully."
    });
  };

  return (
    <ContentArea>
      <div className="space-y-8">
        <div>
          <h2 className="text-2xl font-bold mb-4">Deleted Pages</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence>
              {deletedPages.map((page) => (
                <motion.div
                  key={page.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                >
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between p-4">
                      <h3 className="font-semibold">{page.name}</h3>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => restorePage(page)}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    </CardHeader>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-bold mb-4">Deleted Tasks</h2>
          <div className="space-y-4">
            <AnimatePresence>
              {deletedTasks.map((task) => (
                <motion.div
                  key={task.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                >
                  <Card>
                    <CardContent className="flex items-center justify-between p-4">
                      <span className="flex items-center gap-2">
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                        {task.title}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => restoreTask(task)}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </ContentArea>
  );
}