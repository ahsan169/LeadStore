import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CalendarIcon, Clock, User, Mail, Building, Phone } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface ScheduleDemoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const demoSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional(),
  company: z.string().optional(),
  preferredDate: z.date({
    required_error: 'Please select a date for your demo',
  }),
  preferredTime: z.string().min(1, 'Please select a preferred time'),
  message: z.string().optional(),
});

const timeSlots = [
  '9:00 AM',
  '10:00 AM',
  '11:00 AM',
  '12:00 PM',
  '1:00 PM',
  '2:00 PM',
  '3:00 PM',
  '4:00 PM',
  '5:00 PM',
];

export function ScheduleDemoModal({ isOpen, onClose }: ScheduleDemoModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const form = useForm<z.infer<typeof demoSchema>>({
    resolver: zodResolver(demoSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      company: '',
      preferredTime: '',
      message: '',
    },
  });
  
  const demoMutation = useMutation({
    mutationFn: async (values: z.infer<typeof demoSchema>) => {
      const formattedData = {
        ...values,
        preferredDate: format(values.preferredDate, 'yyyy-MM-dd'),
      };
      return await apiRequest('POST', '/api/demo', formattedData);
    },
    onSuccess: () => {
      toast({
        title: 'Demo scheduled!',
        description: "We'll send you a calendar invite shortly.",
      });
      form.reset();
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: 'Scheduling failed',
        description: error.message || 'Please try again',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      setIsSubmitting(false);
    },
  });
  
  const handleSubmit = (values: z.infer<typeof demoSchema>) => {
    setIsSubmitting(true);
    demoMutation.mutate(values);
  };
  
  // Disable past dates and weekends
  const disabledDays = (date: Date) => {
    const day = date.getDay();
    return date < new Date() || day === 0 || day === 6; // Disable past dates and weekends
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl" data-testid="modal-schedule-demo">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <CalendarIcon className="w-6 h-6 text-primary" />
            Schedule Your Demo
          </DialogTitle>
          <DialogDescription>
            See how Land of Leads can transform your MCA business with a personalized demo
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      <User className="w-3 h-3 inline mr-1" />
                      Full Name *
                    </FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="John Doe" 
                        {...field} 
                        data-testid="input-demo-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      <Mail className="w-3 h-3 inline mr-1" />
                      Email *
                    </FormLabel>
                    <FormControl>
                      <Input 
                        type="email" 
                        placeholder="john@example.com" 
                        {...field} 
                        data-testid="input-demo-email"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      <Phone className="w-3 h-3 inline mr-1" />
                      Phone
                    </FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="(555) 123-4567" 
                        {...field} 
                        data-testid="input-demo-phone"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="company"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      <Building className="w-3 h-3 inline mr-1" />
                      Company
                    </FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Acme Corp" 
                        {...field} 
                        data-testid="input-demo-company"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="preferredDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>
                      <CalendarIcon className="w-3 h-3 inline mr-1" />
                      Preferred Date *
                    </FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              'w-full pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                            data-testid="button-demo-date"
                          >
                            {field.value ? (
                              format(field.value, 'PPP')
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={disabledDays}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="preferredTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      <Clock className="w-3 h-3 inline mr-1" />
                      Preferred Time *
                    </FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-demo-time">
                          <SelectValue placeholder="Select a time" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {timeSlots.map((time) => (
                          <SelectItem key={time} value={time} data-testid={`option-time-${time}`}>
                            {time}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Additional Notes (Optional)</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Any specific topics you'd like to cover?" 
                      {...field} 
                      data-testid="input-demo-message"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {/* What to expect */}
            <div className="bg-muted/50 p-4 rounded-lg">
              <h4 className="font-medium mb-2">What to Expect:</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• 30-minute personalized walkthrough</li>
                <li>• Live demonstration of lead quality and features</li>
                <li>• Custom pricing based on your volume needs</li>
                <li>• Q&A with our MCA specialists</li>
              </ul>
            </div>
            
            <div className="flex justify-end gap-2 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={onClose}
                disabled={isSubmitting}
                data-testid="button-demo-cancel"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting}
                data-testid="button-demo-submit"
              >
                {isSubmitting ? 'Scheduling...' : (
                  <>
                    <CalendarIcon className="w-4 h-4 mr-2" />
                    Schedule Demo
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}