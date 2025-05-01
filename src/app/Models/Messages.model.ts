export interface Messages{
    from: string;
    to: string;
    text: string;
    time: Date;
    status?: 'sent' | 'delivered' | 'seen';
}