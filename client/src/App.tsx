import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { DarkModeToggle } from "@/components/dark-mode-toggle";
import Home from "@/pages/home";
import PageView from "@/pages/page-view";
import Bin from "@/pages/bin";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/page/:id" component={PageView} />
      <Route path="/bin" component={Bin} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router />
      <DarkModeToggle />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
