import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { MoreVertical, Trash2, Edit2 } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { db, Page } from "@/lib/db";
import { useState } from "react";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
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

interface PageCardProps {
  page: Page;
  onDelete: () => void;
}

export function PageCard({ page, onDelete }: PageCardProps) {
  const [, setLocation] = useLocation();
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(page.name);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);

  const handleDelete = async () => {
    await db.pages.update(page.id!, { isDeleted: 1 });
    await db.addHistoryEntry("delete_page", `Deleted page: ${page.name}`);
    onDelete();
    setShowDeleteDialog(false);
  };

  const startEditing = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsEditing(true);
    setEditedName(page.name);
    setShowRenameDialog(true);
  };

  const handleRename = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!editedName.trim() || editedName === page.name) {
      setIsEditing(false);
      setShowRenameDialog(false);
      return;
    }

    try {
      await db.pages.update(page.id!, { name: editedName.trim() });
      await db.addHistoryEntry("rename_page", `Renamed page from "${page.name}" to "${editedName}"`);
      onDelete(); // This will refresh the pages list
      setIsEditing(false);
      setShowRenameDialog(false);
    } catch (error) {
      console.error("Error renaming page:", error);
      setEditedName(page.name);
      setIsEditing(false);
      setShowRenameDialog(false);
    }
  };

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        whileHover={{ scale: 1.02 }}
        className="cursor-pointer"
        onClick={() => !isEditing && setLocation(`/page/${page.id}`)}
      >
        <Card>
          <CardHeader className="flex flex-row items-center justify-between p-4">
            <h3 
              className="font-semibold text-lg"
              onDoubleClick={startEditing}
            >
              {page.name}
            </h3>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon">
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={(e) => {
                  e.stopPropagation();
                  startEditing();
                }}>
                  <Edit2 className="mr-2 h-4 w-4" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => {
                  e.stopPropagation();
                  setShowDeleteDialog(true);
                }}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-sm text-muted-foreground">
              Created {new Date(page.createdAt).toLocaleDateString()}
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Page</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{page.name}"? The page will be moved to the bin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rename Confirmation Dialog */}
      <AlertDialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rename Page</AlertDialogTitle>
            <AlertDialogDescription>
              Enter a new name for "{page.name}".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Input
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRename()}
              autoFocus
              className="w-full"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setEditedName(page.name);
              setIsEditing(false);
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleRename}>
              Rename
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}