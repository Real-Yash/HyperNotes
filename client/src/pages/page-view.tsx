import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContentArea } from "@/components/ui/content-area";
import { TaskList } from "@/components/task-list";
import { db, Page, Task } from "@/lib/db";

export default function PageView() {
  const [, params] = useRoute("/page/:id");
  const [, navigate] = useLocation();
  const [page, setPage] = useState<Page | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);

  const loadPage = async () => {
    if (!params?.id) return;
    
    const pageData = await db.pages.get(parseInt(params.id));
    if (!pageData) {
      navigate("/");
      return;
    }
    setPage(pageData);

    const pageTasks = await db.tasks
      .where("pageId")
      .equals(parseInt(params.id))
      .and(task => !task.isDeleted)
      .toArray();
    setTasks(pageTasks);
  };

  useEffect(() => {
    loadPage();
  }, [params?.id]);

  if (!page) return null;

  return (
    <ContentArea>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">{page.name}</h1>
        </div>

        <TaskList
          pageId={page.id!}
          tasks={tasks}
          onUpdate={loadPage}
        />
      </div>
    </ContentArea>
  );
}
