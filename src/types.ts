export type Category = 'accessory' | 'textile' | 'leather' | 'ceramic' | 'wood' | 'paper' | 'scent' | 'art' | 'food' | 'class' | 'other';
export interface Stall {
    id: string;
    region: 'hk';
    market: string;
    street: string;
    slot: number;
    name: string;
    by: string;
    category: Category;
    color: string;
    sign: string;
    note: string;
    items: {
        name: string;
        price: number;
    }[];
    photos: string[];
    igUrl: string;
    shopUrl?: string;
    demo?: boolean;
    approvedAt: string;
}
export interface Application extends Omit<Stall, 'id' | 'slot' | 'approvedAt' | 'photos' | 'demo'> {
    email: string;
    own: boolean;
    consent: boolean;
    keepPhotos?: string[];
}
export const COLORS = ['#e86a5c', '#f2a541', '#f5d76e', '#7cc6a4', '#5fa8d3', '#8e7cc3', '#f29bb6', '#6b7a8f'];
export const CATEGORIES: Category[] = ['accessory', 'textile', 'leather', 'ceramic', 'wood', 'paper', 'scent', 'art', 'food', 'class', 'other'];
