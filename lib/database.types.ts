export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type PlayerRank = 'tycoon' | 'rich' | 'poor' | 'beggar' | 'none';
export type FriendStatus = 'pending' | 'accepted' | 'blocked';
export type RoomStatus = 'waiting' | 'in_progress' | 'finished';
export type BotDifficulty = 'easy' | 'medium' | 'hard';

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          username: string;
          avatar_url: string | null;
          total_games: number;
          wins: number;
          total_points: number;
          created_at: string;
        };
        Insert: {
          id: string;
          username: string;
          avatar_url?: string | null;
          total_games?: number;
          wins?: number;
          total_points?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          username?: string;
          avatar_url?: string | null;
          total_games?: number;
          wins?: number;
          total_points?: number;
          created_at?: string;
        };
      };
      friends: {
        Row: {
          id: string;
          user_id: string;
          friend_id: string;
          status: FriendStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          friend_id: string;
          status?: FriendStatus;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          friend_id?: string;
          status?: FriendStatus;
          created_at?: string;
        };
      };
      game_rooms: {
        Row: {
          id: string;
          room_code: string;
          host_id: string;
          status: RoomStatus;
          current_round: number;
          is_revolution: boolean;
          game_state: Json;
          bot_difficulty: BotDifficulty;
          created_at: string;
        };
        Insert: {
          id?: string;
          room_code: string;
          host_id: string;
          status?: RoomStatus;
          current_round?: number;
          is_revolution?: boolean;
          game_state?: Json;
          bot_difficulty?: BotDifficulty;
          created_at?: string;
        };
        Update: {
          id?: string;
          room_code?: string;
          host_id?: string;
          status?: RoomStatus;
          current_round?: number;
          is_revolution?: boolean;
          game_state?: Json;
          bot_difficulty?: BotDifficulty;
          created_at?: string;
        };
      };
      game_players: {
        Row: {
          id: string;
          room_id: string;
          user_id: string | null;
          seat_position: number;
          is_bot: boolean;
          bot_name: string | null;
          current_rank: PlayerRank;
          points: number;
          is_ready: boolean;
        };
        Insert: {
          id?: string;
          room_id: string;
          user_id?: string | null;
          seat_position: number;
          is_bot?: boolean;
          bot_name?: string | null;
          current_rank?: PlayerRank;
          points?: number;
          is_ready?: boolean;
        };
        Update: {
          id?: string;
          room_id?: string;
          user_id?: string | null;
          seat_position?: number;
          is_bot?: boolean;
          bot_name?: string | null;
          current_rank?: PlayerRank;
          points?: number;
          is_ready?: boolean;
        };
      };
      game_history: {
        Row: {
          id: string;
          room_id: string;
          user_id: string;
          final_rank: PlayerRank;
          final_points: number;
          played_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          user_id: string;
          final_rank: PlayerRank;
          final_points: number;
          played_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          user_id?: string;
          final_rank?: PlayerRank;
          final_points?: number;
          played_at?: string;
        };
      };
    };
  };
}
