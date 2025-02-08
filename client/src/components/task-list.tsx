import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { db, Task } from "@/lib/db";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface TaskListProps {
  pageId: number;
  tasks: Task[];
  onUpdate: () => void;
}

export function TaskList({ pageId, tasks, onUpdate }: TaskListProps) {
  const [newTask, setNewTask] = useState("");
  const { toast } = useToast();
  const [expandedTask, setExpandedTask] = useState<number | null>(null);
  const [editingNotes, setEditingNotes] = useState<{ [key: number]: string }>({});
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [taskToToggle, setTaskToToggle] = useState<Task | null>(null);

  const addTask = async () => {
    if (!newTask.trim()) return;

    await db.tasks.add({
      pageId,
      title: newTask,
      completed: 0,
      createdAt: new Date(),
      isDeleted: 0,
      notes: ""
    });

    await db.addHistoryEntry("add_task", `Added task: ${newTask}`);
    setNewTask("");
    onUpdate();
  };

  const toggleTask = async (task: Task) => {
    if (task.id === undefined) return;

    await db.tasks.update(task.id, {
      completed: task.completed === 1 ? 0 : 1,
      completedAt: task.completed === 0 ? new Date() : undefined
    });

    await db.addHistoryEntry(
      "toggle_task",
      `${task.completed === 1 ? 'Uncompleted' : 'Completed'} task: ${task.title}`
    );
    onUpdate();
    setTaskToToggle(null);
  };

  const deleteTask = async (task: Task) => {
    if (task.id === undefined) return;

    await db.tasks.update(task.id, { isDeleted: 1 });
    await db.addHistoryEntry("delete_task", `Deleted task: ${task.title}`);
    onUpdate();
    setTaskToDelete(null);

    toast({
      title: "Task moved to trash",
      description: "The task has been moved to the trash bin."
    });
  };

  const updateNotes = async (taskId: number, notes: string) => {
    try {
      if (taskId === undefined) return;

      setEditingNotes(prev => ({
        ...prev,
        [taskId]: notes
      }));

      await db.tasks.update(taskId, { notes });
      await db.addHistoryEntry("update_notes", `Updated notes for task`);
      onUpdate();
    } catch (error) {
      console.error("Error updating notes:", error);
      toast({
        title: "Error",
        description: "Failed to update task notes.",
        variant: "destructive"
      });
    }
  };

  const handleExpandTask = (taskId: number) => {
    const task = tasks.find(t => t.id === taskId);
    if (task && !editingNotes[taskId]) {
      setEditingNotes(prev => ({
        ...prev,
        [taskId]: task.notes || ""
      }));
    }
    setExpandedTask(expandedTask === taskId ? null : taskId);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="Add a new task..."
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addTask()}
        />
        <Button onClick={addTask}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <AnimatePresence>
        {tasks.map((task) => (
          <motion.div
            key={task.id}
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="border rounded-lg p-3 space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-1">
                <Checkbox
                  checked={task.completed === 1}
                  onCheckedChange={() => setTaskToToggle(task)}
                />
                <div className="flex flex-col">
                  <span className={task.completed === 1 ? "line-through text-muted-foreground" : ""}>
                    {task.title}
                  </span>
                  {task.completedAt && (
                    <span className="text-xs text-muted-foreground">
                      Completed on {new Date(task.completedAt).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleExpandTask(task.id!)}
                >
                  {expandedTask === task.id ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setTaskToDelete(task)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {expandedTask === task.id && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                style={{ overflow: "hidden" }}
                className="relative"
              >
                <div className="absolute inset-0 bg-background/50 backdrop-blur-sm" />
                <Textarea
                  placeholder="Add notes..."
                  value={editingNotes[task.id!] || ""}
                  onChange={(e) => updateNotes(task.id!, e.target.value)}
                  className="w-full mt-2 relative z-10"
                  rows={4}
                />
              </motion.div>
            )}
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={taskToDelete !== null} onOpenChange={() => setTaskToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this task? It will be moved to the trash.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => taskToDelete && deleteTask(taskToDelete)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Toggle Completion Confirmation Dialog */}
      <AlertDialog open={taskToToggle !== null} onOpenChange={() => setTaskToToggle(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {taskToToggle?.completed === 1 ? 'Mark as Incomplete' : 'Mark as Complete'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to mark this task as {taskToToggle?.completed === 1 ? 'incomplete' : 'complete'}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => taskToToggle && toggleTask(taskToToggle)}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}