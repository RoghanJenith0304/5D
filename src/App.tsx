/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  orderBy,
  runTransaction,
  getDoc,
  getDocFromServer
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User
} from 'firebase/auth';
import { db, auth } from './firebase';
import { Event, Booking } from './types';
import { 
  Calendar, 
  MapPin, 
  Users, 
  Plus, 
  LogOut, 
  Ticket, 
  Trash2, 
  X, 
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Firestore Error Handling
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Error Boundary Component
interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if ((this as any).state.hasError) {
      return (
        <div className="min-h-screen bg-white flex items-center justify-center p-8 text-center">
          <div className="max-w-md space-y-4">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle size={32} />
            </div>
            <h2 className="text-2xl font-bold">Something went wrong</h2>
            <p className="text-black/50">We encountered an unexpected error. Please try refreshing the page.</p>
            <pre className="bg-black/5 p-4 rounded-xl text-xs text-left overflow-auto max-h-40">
              {(this as any).state.error?.message || String((this as any).state.error)}
            </pre>
            <button 
              onClick={() => window.location.reload()}
              className="bg-black text-white px-6 py-2 rounded-full font-medium"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  return (
    <ErrorBoundary>
      <EventlyApp />
    </ErrorBoundary>
  );
}

function EventlyApp() {
  const [user, setUser] = useState<User | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [myBookings, setMyBookings] = useState<Booking[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'explore' | 'my-bookings'>('explore');

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Test Connection to Firestore
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  // Events Listener
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'events'), orderBy('date', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const eventsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Event));
      setEvents(eventsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'events');
    });
    return () => unsubscribe();
  }, [user]);

  // Bookings Listener
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'bookings'), where('userId', '==', user.uid), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const bookingsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking));
      setMyBookings(bookingsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'bookings');
    });
    return () => unsubscribe();
  }, [user]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = () => signOut(auth);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-8 h-8 border-2 border-black border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user) {
    return <LoginView onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5] text-[#1A1A1A] font-sans">
      {/* Navigation */}
      <nav className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-black/5">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <h1 className="text-xl font-bold tracking-tight">EVENTLY</h1>
            <div className="hidden md:flex items-center gap-1">
              <NavButton 
                active={view === 'explore'} 
                onClick={() => setView('explore')}
                icon={<Calendar size={18} />}
                label="Explore"
              />
              <NavButton 
                active={view === 'my-bookings'} 
                onClick={() => setView('my-bookings')}
                icon={<Ticket size={18} />}
                label="My Bookings"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsCreateModalOpen(true)}
              className="bg-black text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-black/80 transition-colors flex items-center gap-2"
            >
              <Plus size={18} />
              <span>Create Event</span>
            </button>
            <div className="h-8 w-px bg-black/10 mx-2" />
            <button 
              onClick={handleLogout}
              className="p-2 hover:bg-black/5 rounded-full transition-colors text-black/60"
              title="Logout"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          {view === 'explore' ? (
            <motion.div
              key="explore"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              <header>
                <h2 className="text-3xl font-bold tracking-tight">Upcoming Events</h2>
                <p className="text-black/50 mt-1">Discover and book the best experiences around you.</p>
              </header>

              {events.length === 0 ? (
                <div className="bg-white rounded-2xl p-12 text-center border border-black/5">
                  <div className="w-16 h-16 bg-black/5 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Calendar className="text-black/20" size={32} />
                  </div>
                  <h3 className="text-lg font-medium">No events found</h3>
                  <p className="text-black/50 mt-1">Be the first to create an event!</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {events.map((event) => (
                    <EventCard key={event.id} event={event} user={user} />
                  ))}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="bookings"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              <header>
                <h2 className="text-3xl font-bold tracking-tight">My Bookings</h2>
                <p className="text-black/50 mt-1">Manage your reservations and tickets.</p>
              </header>

              {myBookings.length === 0 ? (
                <div className="bg-white rounded-2xl p-12 text-center border border-black/5">
                  <div className="w-16 h-16 bg-black/5 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Ticket className="text-black/20" size={32} />
                  </div>
                  <h3 className="text-lg font-medium">No bookings yet</h3>
                  <p className="text-black/50 mt-1">Explore events and start booking!</p>
                  <button 
                    onClick={() => setView('explore')}
                    className="mt-6 text-sm font-medium underline underline-offset-4"
                  >
                    Go to Explore
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {myBookings.map((booking) => {
                    const event = events.find(e => e.id === booking.eventId);
                    return (
                      <BookingRow 
                        key={booking.id} 
                        booking={booking} 
                        event={event} 
                        onCancel={() => handleCancelBooking(booking, event)}
                      />
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Modals */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <CreateEventModal 
            onClose={() => setIsCreateModalOpen(false)} 
            user={user} 
          />
        )}
      </AnimatePresence>

      <footer className="mt-auto py-12 border-t border-black/5 text-center text-black/40 text-sm">
        <p>&copy; 2026 Evently Platform. All rights reserved.</p>
      </footer>
    </div>
  );
}

function LoginView({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="space-y-4"
        >
          <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center mx-auto mb-8 rotate-3 shadow-2xl shadow-white/10">
            <Calendar size={40} className="text-black" />
          </div>
          <h1 className="text-5xl font-bold text-white tracking-tighter">EVENTLY</h1>
          <p className="text-white/50 text-lg">Your gateway to unforgettable experiences.</p>
        </motion.div>

        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          onClick={onLogin}
          className="w-full bg-white text-black py-4 rounded-2xl font-bold text-lg hover:bg-white/90 transition-all flex items-center justify-center gap-3 active:scale-95"
        >
          <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
          Continue with Google
        </motion.button>
        
        <p className="text-white/30 text-xs uppercase tracking-widest">Secure Authentication Powered by Firebase</p>
      </div>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 transition-all",
        active ? "bg-black text-white" : "text-black/60 hover:bg-black/5"
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

const EventCard: React.FC<{ event: Event, user: User }> = ({ event, user }) => {
  const [isBooking, setIsBooking] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const isCreator = event.creatorId === user.uid;
  const isSoldOut = event.availableSeats === 0;

  const handleBook = async () => {
    if (isSoldOut || isBooking) return;
    setIsBooking(true);
    
    try {
      await runTransaction(db, async (transaction) => {
        const eventRef = doc(db, 'events', event.id);
        const eventDoc = await transaction.get(eventRef);
        
        if (!eventDoc.exists()) throw new Error("Event does not exist!");
        
        const currentAvailable = eventDoc.data().availableSeats;
        if (currentAvailable <= 0) throw new Error("Event is sold out!");

        // Create booking
        const bookingRef = doc(collection(db, 'bookings'));
        transaction.set(bookingRef, {
          eventId: event.id,
          userId: user.uid,
          userName: user.displayName || 'Anonymous',
          seatsBooked: 1,
          timestamp: new Date().toISOString()
        });

        // Update event
        transaction.update(eventRef, {
          availableSeats: currentAvailable - 1
        });
      });
      setShowConfirm(true);
      setTimeout(() => setShowConfirm(false), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `events/${event.id}/bookings`);
    } finally {
      setIsBooking(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this event?")) return;
    try {
      await deleteDoc(doc(db, 'events', event.id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `events/${event.id}`);
    }
  };

  return (
    <motion.div 
      layout
      className="bg-white rounded-2xl overflow-hidden border border-black/5 hover:shadow-xl hover:shadow-black/5 transition-all group"
    >
      <div className="aspect-video bg-black/5 relative overflow-hidden">
        <img 
          src={event.imageUrl || `https://picsum.photos/seed/${event.id}/800/450`} 
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          alt={event.title}
          referrerPolicy="no-referrer"
        />
        <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold shadow-sm">
          ${event.price}
        </div>
        {isCreator && (
          <button 
            onClick={handleDelete}
            className="absolute top-4 left-4 p-2 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      <div className="p-6 space-y-4">
        <div>
          <h3 className="text-xl font-bold leading-tight">{event.title}</h3>
          <p className="text-black/50 text-sm line-clamp-2 mt-1">{event.description}</p>
        </div>

        <div className="space-y-2 text-sm text-black/70">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-black/30" />
            <span>{format(new Date(event.date), 'PPP p')}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin size={16} className="text-black/30" />
            <span>{event.location}</span>
          </div>
          <div className="flex items-center gap-2">
            <Users size={16} className="text-black/30" />
            <span className={cn(isSoldOut && "text-red-500 font-medium")}>
              {isSoldOut ? "Sold Out" : `${event.availableSeats} seats left`}
            </span>
          </div>
        </div>

        <button 
          onClick={handleBook}
          disabled={isSoldOut || isBooking || isCreator}
          className={cn(
            "w-full py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2",
            isSoldOut ? "bg-black/5 text-black/20 cursor-not-allowed" : 
            isCreator ? "bg-black/5 text-black/40 cursor-default" :
            "bg-black text-white hover:bg-black/80 active:scale-95"
          )}
        >
          {isBooking ? (
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }} className="w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
          ) : showConfirm ? (
            <CheckCircle2 size={20} />
          ) : isCreator ? (
            "Your Event"
          ) : isSoldOut ? (
            "Sold Out"
          ) : (
            "Book Now"
          )}
        </button>
      </div>
    </motion.div>
  );
}

const BookingRow: React.FC<{ booking: Booking, event?: Event, onCancel: () => void }> = ({ booking, event, onCancel }) => {
  return (
    <motion.div 
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="bg-white p-4 rounded-2xl border border-black/5 flex items-center justify-between gap-4"
    >
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-black/5 rounded-xl flex items-center justify-center text-black/40">
          <Ticket size={24} />
        </div>
        <div>
          <h4 className="font-bold">{event?.title || 'Unknown Event'}</h4>
          <div className="flex items-center gap-3 text-xs text-black/40 mt-1">
            <span>{format(new Date(booking.timestamp), 'MMM d, yyyy')}</span>
            <span>•</span>
            <span>{booking.seatsBooked} Seat{booking.seatsBooked > 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right hidden sm:block">
          <p className="text-xs text-black/40 uppercase tracking-widest font-bold">Status</p>
          <p className="text-sm font-medium text-emerald-600">Confirmed</p>
        </div>
        <button 
          onClick={onCancel}
          className="p-2 hover:bg-red-50 text-red-500 rounded-lg transition-colors"
          title="Cancel Booking"
        >
          <Trash2 size={18} />
        </button>
      </div>
    </motion.div>
  );
}

function CreateEventModal({ onClose, user }: { onClose: () => void, user: User }) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    date: '',
    location: '',
    totalSeats: 50,
    price: 0
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await addDoc(collection(db, 'events'), {
        ...formData,
        availableSeats: formData.totalSeats,
        creatorId: user.uid,
        date: new Date(formData.date).toISOString()
      });
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'events');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="bg-white w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl relative z-10"
      >
        <div className="p-6 border-b border-black/5 flex items-center justify-between">
          <h3 className="text-xl font-bold">Create New Event</h3>
          <button onClick={onClose} className="p-2 hover:bg-black/5 rounded-full"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-widest text-black/40">Event Title</label>
            <input 
              required
              value={formData.title}
              onChange={e => setFormData({...formData, title: e.target.value})}
              className="w-full bg-black/5 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-black transition-all"
              placeholder="e.g. Summer Music Festival"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-widest text-black/40">Description</label>
            <textarea 
              required
              value={formData.description}
              onChange={e => setFormData({...formData, description: e.target.value})}
              className="w-full bg-black/5 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-black transition-all min-h-[100px]"
              placeholder="Tell us about the event..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-widest text-black/40">Date & Time</label>
              <input 
                required
                type="datetime-local"
                value={formData.date}
                onChange={e => setFormData({...formData, date: e.target.value})}
                className="w-full bg-black/5 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-black transition-all"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-widest text-black/40">Location</label>
              <input 
                required
                value={formData.location}
                onChange={e => setFormData({...formData, location: e.target.value})}
                className="w-full bg-black/5 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-black transition-all"
                placeholder="Venue name or city"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-widest text-black/40">Capacity</label>
              <input 
                required
                type="number"
                min="1"
                value={formData.totalSeats}
                onChange={e => setFormData({...formData, totalSeats: parseInt(e.target.value)})}
                className="w-full bg-black/5 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-black transition-all"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-widest text-black/40">Price ($)</label>
              <input 
                required
                type="number"
                min="0"
                value={formData.price}
                onChange={e => setFormData({...formData, price: parseFloat(e.target.value)})}
                className="w-full bg-black/5 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-black transition-all"
              />
            </div>
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-black text-white py-4 rounded-2xl font-bold mt-4 hover:bg-black/80 transition-all active:scale-95 disabled:opacity-50"
          >
            {loading ? "Creating..." : "Launch Event"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

async function handleCancelBooking(booking: Booking, event?: Event) {
  if (!confirm("Are you sure you want to cancel this booking?")) return;
  
  try {
    await runTransaction(db, async (transaction) => {
      const bookingRef = doc(db, 'bookings', booking.id);
      const eventRef = event ? doc(db, 'events', event.id) : null;
      
      transaction.delete(bookingRef);
      
      if (eventRef) {
        const eventDoc = await transaction.get(eventRef);
        if (eventDoc.exists()) {
          transaction.update(eventRef, {
            availableSeats: eventDoc.data().availableSeats + booking.seatsBooked
          });
        }
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `bookings/${booking.id}/cancel`);
  }
}
