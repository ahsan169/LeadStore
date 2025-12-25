import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Crown, Home, MapPin, Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-hero-kingdom p-4">
      <div className="text-center animate-fade-in">
        <Card className="card-kingdom w-full max-w-lg mx-auto animate-scale-in">
          <CardContent className="pt-8 pb-8 px-6">
            <div className="flex justify-center mb-6">
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center glow-crown">
                  <Crown className="h-10 w-10 text-primary" />
                </div>
                <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-secondary flex items-center justify-center animate-pulse">
                  <MapPin className="h-3 w-3 text-secondary-foreground" />
                </div>
              </div>
            </div>

            <h1 className="font-serif text-4xl font-bold text-gradient-royal mb-2" data-testid="text-404-title">
              404
            </h1>
            <h2 className="font-serif text-xl font-semibold text-foreground mb-4" data-testid="text-page-not-found">
              Page Not Found
            </h2>

            <div className="divider-elegant my-6" />

            <p className="text-muted-foreground mb-6 animate-fade-in animate-delay-200" data-testid="text-404-description">
              Alas, noble traveler! The realm you seek has vanished from our kingdom's map. 
              Perhaps it was moved, or it never existed in this land.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center animate-fade-in animate-delay-300">
              <Link href="/">
                <Button className="btn-kingdom w-full sm:w-auto" data-testid="button-go-home">
                  <Home className="h-4 w-4 mr-2" />
                  Return to Kingdom
                </Button>
              </Link>
              <Link href="/leads">
                <Button variant="outline" className="w-full sm:w-auto" data-testid="button-explore-leads">
                  <Compass className="h-4 w-4 mr-2" />
                  Explore Leads
                </Button>
              </Link>
            </div>

            <p className="text-xs text-muted-foreground mt-6 animate-fade-in animate-delay-400">
              If you believe this path should exist, please contact the royal court.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
