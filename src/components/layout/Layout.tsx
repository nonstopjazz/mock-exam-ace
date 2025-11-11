import { ReactNode } from "react";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";

interface LayoutProps {
  children: ReactNode;
  showNav?: boolean;
  showFooter?: boolean;
}

export const Layout = ({ children, showNav = true, showFooter = true }: LayoutProps) => {
  return (
    <div className="flex min-h-screen flex-col">
      {showNav && <Navbar />}
      <main className="flex-1">{children}</main>
      {showFooter && <Footer />}
    </div>
  );
};
