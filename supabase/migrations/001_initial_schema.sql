-- Tycoon Card Game Database Schema
-- Run this in your Supabase SQL editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Custom types
CREATE TYPE player_rank AS ENUM ('tycoon', 'rich', 'poor', 'beggar', 'none');
CREATE TYPE friend_status AS ENUM ('pending', 'accepted', 'blocked');
CREATE TYPE room_status AS ENUM ('waiting', 'in_progress', 'finished');
CREATE TYPE bot_difficulty AS ENUM ('easy', 'medium', 'hard');

-- Users table (extends auth.users)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL,
    avatar_url TEXT,
    total_games INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    total_points INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Friends table
CREATE TABLE IF NOT EXISTS public.friends (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    friend_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    status friend_status DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    UNIQUE(user_id, friend_id)
);

-- Game rooms table
CREATE TABLE IF NOT EXISTS public.game_rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_code TEXT UNIQUE NOT NULL,
    host_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    status room_status DEFAULT 'waiting',
    current_round INTEGER DEFAULT 1,
    is_revolution BOOLEAN DEFAULT FALSE,
    game_state JSONB DEFAULT '{}',
    bot_difficulty bot_difficulty DEFAULT 'medium',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Game players table
CREATE TABLE IF NOT EXISTS public.game_players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES public.game_rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    seat_position INTEGER NOT NULL CHECK (seat_position >= 0 AND seat_position <= 3),
    is_bot BOOLEAN DEFAULT FALSE,
    bot_name TEXT,
    current_rank player_rank DEFAULT 'none',
    points INTEGER DEFAULT 0,
    is_ready BOOLEAN DEFAULT FALSE,
    UNIQUE(room_id, seat_position),
    UNIQUE(room_id, user_id)
);

-- Game history table
CREATE TABLE IF NOT EXISTS public.game_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES public.game_rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    final_rank player_rank NOT NULL,
    final_points INTEGER NOT NULL,
    played_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Indexes for performance
CREATE INDEX idx_friends_user_id ON public.friends(user_id);
CREATE INDEX idx_friends_friend_id ON public.friends(friend_id);
CREATE INDEX idx_game_rooms_room_code ON public.game_rooms(room_code);
CREATE INDEX idx_game_rooms_host_id ON public.game_rooms(host_id);
CREATE INDEX idx_game_rooms_status ON public.game_rooms(status);
CREATE INDEX idx_game_players_room_id ON public.game_players(room_id);
CREATE INDEX idx_game_players_user_id ON public.game_players(user_id);
CREATE INDEX idx_game_history_user_id ON public.game_history(user_id);

-- Row Level Security Policies
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_history ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can view all profiles" ON public.users
    FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON public.users
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.users
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Friends policies
CREATE POLICY "Users can view own friends" ON public.friends
    FOR SELECT USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "Users can create friend requests" ON public.friends
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update friend status" ON public.friends
    FOR UPDATE USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "Users can delete own friendships" ON public.friends
    FOR DELETE USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- Game rooms policies
CREATE POLICY "Anyone can view game rooms" ON public.game_rooms
    FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create rooms" ON public.game_rooms
    FOR INSERT WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Hosts can update their rooms" ON public.game_rooms
    FOR UPDATE USING (auth.uid() = host_id);

-- Game players policies
CREATE POLICY "Anyone can view game players" ON public.game_players
    FOR SELECT USING (true);

CREATE POLICY "Authenticated users can join games" ON public.game_players
    FOR INSERT WITH CHECK (auth.uid() = user_id OR is_bot = true);

CREATE POLICY "Players can update their status" ON public.game_players
    FOR UPDATE USING (auth.uid() = user_id OR is_bot = true);

-- Game history policies
CREATE POLICY "Users can view own history" ON public.game_history
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can insert history" ON public.game_history
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Function to update user stats after game
CREATE OR REPLACE FUNCTION update_user_stats()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.users
    SET
        total_games = total_games + 1,
        wins = CASE WHEN NEW.final_rank = 'tycoon' THEN wins + 1 ELSE wins END,
        total_points = total_points + NEW.final_points
    WHERE id = NEW.user_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-update user stats
CREATE TRIGGER on_game_history_insert
    AFTER INSERT ON public.game_history
    FOR EACH ROW
    EXECUTE FUNCTION update_user_stats();

-- Enable realtime for relevant tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_players;
