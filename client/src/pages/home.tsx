import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ContentArea } from "@/components/ui/content-area";
import { PageCard } from "@/components/page-card";
import { SearchBar } from "@/components/search-bar";
import { db, Page } from "@/lib/db";

export default function Home() {
  const [pages, setPages] = useState<Page[]>([]);
  const [newPageName, setNewPageName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const loadPages = async () => {
    const allPages = await db.pages
      .where("isDeleted")
      .equals(0)
      .reverse()
      .toArray();
    setPages(allPages);
  };

  useEffect(() => {
    loadPages();
  }, []);

  const createPage = async () => {
    if (!newPageName.trim()) return;

    try {
      await db.pages.add({
        name: newPageName,
        createdAt: new Date(),
        isDeleted: 0
      });

      await db.addHistoryEntry("create_page", `Created page: ${newPageName}`);
      setNewPageName("");
      setDialogOpen(false);
      loadPages();
    } catch (error) {
      console.error("Error creating page:", error);
    }
  };

  const filteredPages = pages.filter(page =>
    page.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <ContentArea>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold">HyperNotes</h1>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Page
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Page</DialogTitle>
                <DialogDescription>
                  Enter a name for your new page.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Input
                  placeholder="Page name"
                  value={newPageName}
                  onChange={(e) => setNewPageName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && createPage()}
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={createPage}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <SearchBar value={searchQuery} onChange={setSearchQuery} />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {filteredPages.map((page) => (
              <PageCard
                key={page.id}
                page={page}
                onDelete={loadPages}
              />
            ))}
          </AnimatePresence>
        </div>
      </div>
    </ContentArea>
  );
}