export interface Event {
  id: string;
  title: string;
  description: string;
  date: string;
  location: string;
  totalSeats: number;
  availableSeats: number;
  price: number;
  creatorId: string;
  imageUrl?: string;
}

export interface Booking {
  id: string;
  eventId: string;
  userId: string;
  userName: string;
  seatsBooked: number;
  timestamp: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: 'user' | 'admin';
}
