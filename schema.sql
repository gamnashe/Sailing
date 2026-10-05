-- ==============================================================================
-- מועדון שייט - סכמת בסיס נתונים מלאה ל-Supabase / PostgreSQL
-- כולל: טבלאות, RLS (Row Level Security), אינדקסים, טרנזקציית נעילה מוגנת (FOR UPDATE),
-- קידום אוטומטי מרשימת המתנה, ונתוני Seed ראשוניים.
-- ==============================================================================

-- 1. טיפוסי ENUM
CREATE TYPE user_role AS ENUM ('admin', 'member');
CREATE TYPE user_status AS ENUM ('pending', 'approved', 'rejected', 'suspended');
CREATE TYPE sail_status AS ENUM ('open', 'closed', 'cancelled', 'completed');
CREATE TYPE registration_status AS ENUM ('confirmed', 'waitlist', 'cancelled');
CREATE TYPE sail_creation_policy AS ENUM ('admin_only', 'all_members');
CREATE TYPE boat_status AS ENUM ('available', 'unavailable', 'maintenance');
CREATE TYPE issue_severity AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE issue_status AS ENUM ('open', 'in_progress', 'resolved');

-- 2. טבלת הגדרות מועדון
CREATE TABLE club_settings (
  id INT PRIMARY KEY DEFAULT 1,
  club_name TEXT NOT NULL DEFAULT 'מועדון שייט גלי ים',
  logo_url TEXT DEFAULT '/icon.svg',
  default_max_participants INT NOT NULL DEFAULT 6,
  who_can_create_sails sail_creation_policy NOT NULL DEFAULT 'admin_only',
  cancellation_deadline_hours INT NOT NULL DEFAULT 12,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT single_row_settings CHECK (id = 1)
);

-- 3. טבלת פרופילים (מקושרת ל-auth.users של Supabase)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  avatar_url TEXT,
  experience_level TEXT NOT NULL DEFAULT 'איש צוות מנוסה',
  role user_role NOT NULL DEFAULT 'member',
  status user_status NOT NULL DEFAULT 'pending',
  credits INT NOT NULL DEFAULT 5, -- נקודות קרדיט להפלגות
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- אינדקסים לפרופילים
CREATE INDEX idx_profiles_status ON profiles(status);
CREATE INDEX idx_profiles_role ON profiles(role);

-- 3.1 טבלת כלי שייט (צי הסירות)
CREATE TABLE boats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  model TEXT NOT NULL,
  status boat_status NOT NULL DEFAULT 'available',
  status_notes TEXT,
  berth_location TEXT DEFAULT 'מרינה הרצליה',
  capacity INT NOT NULL DEFAULT 8,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3.2 טבלת דיווחי תקלות כלי שייט (לוח מודעות)
CREATE TABLE boat_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  boat_id UUID NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'מנוע',
  severity issue_severity NOT NULL DEFAULT 'medium',
  status issue_status NOT NULL DEFAULT 'open',
  photo_url TEXT,
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX idx_boat_issues_boat ON boat_issues(boat_id, status);

-- 4. טבלת הפלגות
CREATE TABLE sails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  sail_type TEXT NOT NULL DEFAULT 'club', -- 'club' (מועדון 3-6 אנשים, 1 קרדיט) או 'private' (פרטית, מינ' 3 שעות, 3 קרדיטים + 1 לכל שעה נוספת)
  date DATE NOT NULL,
  departure_time TIME NOT NULL,
  estimated_return_time TIME NOT NULL,
  duration_hours NUMERIC(4, 1) DEFAULT 3,
  boat_name TEXT NOT NULL,
  skipper_name TEXT NOT NULL,
  skipper_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  departure_point TEXT NOT NULL,
  notes TEXT DEFAULT '',
  min_participants INT NOT NULL DEFAULT 3,
  max_participants INT NOT NULL DEFAULT 6,
  credit_cost INT NOT NULL DEFAULT 1,
  status sail_status NOT NULL DEFAULT 'open',
  cancellation_reason TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sails_date ON sails(date);
CREATE INDEX idx_sails_status ON sails(status);

-- 5. טבלת הרשמות להפלגה (משתתפים מאושרים ורשימת המתנה)
CREATE TABLE sail_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sail_id UUID NOT NULL REFERENCES sails(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status registration_status NOT NULL DEFAULT 'confirmed',
  waitlist_position INT, -- 1, 2, 3... כאשר הסטטוס הוא waitlist
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  -- מניעת הרשמה כפולה לאותה הפלגה
  CONSTRAINT unique_sail_user UNIQUE(sail_id, user_id)
);

CREATE INDEX idx_registrations_sail ON sail_registrations(sail_id, status);
CREATE INDEX idx_registrations_user ON sail_registrations(user_id);

-- 6. טבלת תמונות להפלגה
CREATE TABLE sail_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sail_id UUID NOT NULL REFERENCES sails(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  caption TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. טבלת פוסטים בפיד
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  images TEXT[] DEFAULT ARRAY[]::TEXT[],
  link_preview JSONB,
  is_pinned BOOLEAN DEFAULT FALSE,
  sail_id UUID REFERENCES sails(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_posts_created ON posts(created_at DESC);
CREATE INDEX idx_posts_pinned ON posts(is_pinned);

-- 8. לייקים ותגובות לפוסטים
CREATE TABLE post_likes (
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. טבלת התראות
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  target_id TEXT,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, read);

-- ==============================================================================
-- 10. פונקציית טרנזקציה עם נעילה אטומית: הרשמה להפלגה ללא Race Condition!
-- ==============================================================================
CREATE OR REPLACE FUNCTION join_sail_atomic(
  p_sail_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sail RECORD;
  v_confirmed_count INT;
  v_max_waitlist_pos INT;
  v_existing RECORD;
  v_new_status registration_status;
  v_new_waitlist_pos INT;
BEGIN
  -- נעילת שורת ההפלגה למניעת עדכונים מקבילים (Race Condition Lock)
  SELECT * INTO v_sail
  FROM sails
  WHERE id = p_sail_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'ההפלגה לא נמצאה');
  END IF;

  IF v_sail.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'message', 'ההרשמה להפלגה זו נעולה או בוטלה');
  END IF;

  -- בדיקה האם המשתמש כבר רשום
  SELECT * INTO v_existing
  FROM sail_registrations
  WHERE sail_id = p_sail_id AND user_id = p_user_id AND status != 'cancelled';

  IF FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'הנך כבר רשום או ממתין להפלגה זו');
  END IF;

  -- ספירת משתתפים מאושרים כעת (תחת הנעילה האטומית)
  SELECT COUNT(*) INTO v_confirmed_count
  FROM sail_registrations
  WHERE sail_id = p_sail_id AND status = 'confirmed';

  IF v_confirmed_count < v_sail.max_participants THEN
    -- יש מקום פנוי!
    v_new_status := 'confirmed';
    v_new_waitlist_pos := NULL;
  ELSE
    -- ההפלגה מלאה: כניסה לרשימת המתנה
    v_new_status := 'waitlist';
    SELECT COALESCE(MAX(waitlist_position), 0) + 1 INTO v_new_waitlist_pos
    FROM sail_registrations
    WHERE sail_id = p_sail_id AND status = 'waitlist';
  END IF;

  -- הוספת ההרשמה או עדכון רשומת ביטול ישנה
  INSERT INTO sail_registrations (sail_id, user_id, status, waitlist_position, registered_at, confirmed_at)
  VALUES (
    p_sail_id,
    p_user_id,
    v_new_status,
    v_new_waitlist_pos,
    NOW(),
    CASE WHEN v_new_status = 'confirmed' THEN NOW() ELSE NULL END
  )
  ON CONFLICT (sail_id, user_id)
  DO UPDATE SET
    status = EXCLUDED.status,
    waitlist_position = EXCLUDED.waitlist_position,
    registered_at = NOW(),
    confirmed_at = EXCLUDED.confirmed_at;

  RETURN jsonb_build_object(
    'success', true,
    'status', v_new_status,
    'waitlist_position', v_new_waitlist_pos,
    'message', CASE
      WHEN v_new_status = 'confirmed' THEN 'נרשמת בהצלחה להפלגה! מקומך מובטח ⛵'
      ELSE 'ההפלגה מלאה. נרשמת לרשימת ההמתנה במקום ' || v_new_waitlist_pos
    END
  );
END;
$$;

-- ==============================================================================
-- 11. פונקציית ביטול הרשמה וקידום אוטומטי של הראשון בהמתנה
-- ==============================================================================
CREATE OR REPLACE FUNCTION cancel_sail_registration_atomic(
  p_sail_id UUID,
  p_user_id UUID,
  p_is_admin_override BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sail RECORD;
  v_reg RECORD;
  v_next_waitlist RECORD;
  v_settings RECORD;
  v_hours_left NUMERIC;
BEGIN
  -- נעילת שורת ההפלגה
  SELECT * INTO v_sail FROM sails WHERE id = p_sail_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'הפלגה לא נמצאה');
  END IF;

  -- מציאת הרשמת המשתמש
  SELECT * INTO v_reg FROM sail_registrations
  WHERE sail_id = p_sail_id AND user_id = p_user_id AND status != 'cancelled';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'לא נמצאה הרשמה פעילה');
  END IF;

  -- בדיקת שעות חלון ביטול (אלא אם מנהל מאשר)
  IF NOT p_is_admin_override THEN
    SELECT * INTO v_settings FROM club_settings WHERE id = 1;
    v_hours_left := EXTRACT(EPOCH FROM ((v_sail.date + v_sail.departure_time) - NOW())) / 3600;
    IF v_hours_left < v_settings.cancellation_deadline_hours AND v_hours_left > 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', 'נעילת ביטול: לא ניתן לבטל פחות מ-' || v_settings.cancellation_deadline_hours || ' שעות לפני ההפלגה'
      );
    END IF;
  END IF;

  -- סימון המבטל כ-cancelled
  UPDATE sail_registrations
  SET status = 'cancelled', waitlist_position = NULL
  WHERE id = v_reg.id;

  -- אם המבטל היה confirmed, מקדמים את #1 ברשימת ההמתנה
  IF v_reg.status = 'confirmed' THEN
    SELECT * INTO v_next_waitlist
    FROM sail_registrations
    WHERE sail_id = p_sail_id AND status = 'waitlist'
    ORDER BY waitlist_position ASC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      -- שדרוג הממתין הראשון ל-confirmed
      UPDATE sail_registrations
      SET status = 'confirmed', waitlist_position = NULL, confirmed_at = NOW()
      WHERE id = v_next_waitlist.id;

      -- הזזת שאר הממתינים בתור אחד קדימה
      UPDATE sail_registrations
      SET waitlist_position = waitlist_position - 1
      WHERE sail_id = p_sail_id AND status = 'waitlist' AND id != v_next_waitlist.id;

      -- יצירת התראה לממתין שעלה להפלגה
      INSERT INTO notifications (user_id, type, title, message, target_id)
      VALUES (
        v_next_waitlist.user_id,
        'waitlist_promoted',
        'מקום התפנה בהפלגה! 🎉',
        'התפנה מקום בהפלגה "' || v_sail.title || '". מקומך אושר אוטומטית!',
        p_sail_id::TEXT
      );
    END IF;
  ELSE
    -- אם המבטל היה ב-waitlist, מסדרים מחדש את מיקומי שאר הממתינים
    UPDATE sail_registrations
    SET waitlist_position = waitlist_position - 1
    WHERE sail_id = p_sail_id AND status = 'waitlist' AND waitlist_position > v_reg.waitlist_position;
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'הביטול בוצע בהצלחה');
END;
$$;

-- ==============================================================================
-- 12. הגדרת Row Level Security (RLS)
-- ==============================================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sails ENABLE ROW LEVEL SECURITY;
ALTER TABLE sail_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sail_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- פונקציית עזר לבדיקה אם המשתמש הוא מנהל
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin' AND status = 'approved'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- פונקציית עזר לבדיקה אם המשתמש הוא חבר מאושר
CREATE OR REPLACE FUNCTION is_approved_member()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND status = 'approved'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- מדיניות RLS:
-- Profiles: כולם קוראים פרופילים של חברים מאושרים, כל אחד עורך את שלו, מנהל עורך הכל
CREATE POLICY "Profiles are viewable by approved members" ON profiles
  FOR SELECT USING (is_approved_member() OR auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can manage all profiles" ON profiles
  FOR ALL USING (is_admin());

-- Sails: חברים מאושרים צופים, מנהלים יוצרים/עורכים (או חברים אם מותר בהגדרות)
CREATE POLICY "Sails viewable by approved members" ON sails
  FOR SELECT USING (is_approved_member());

CREATE POLICY "Admins create sails" ON sails
  FOR INSERT WITH CHECK (is_admin() OR (is_approved_member() AND (SELECT who_can_create_sails FROM club_settings WHERE id = 1) = 'all_members'));

CREATE POLICY "Admins update sails" ON sails
  FOR UPDATE USING (is_admin() OR created_by = auth.uid());

-- Posts: חברים מאושרים רואים ומפרסמים
CREATE POLICY "Posts viewable by approved members" ON posts
  FOR SELECT USING (is_approved_member());

CREATE POLICY "Approved members can create posts" ON posts
  FOR INSERT WITH CHECK (is_approved_member() AND author_id = auth.uid());

CREATE POLICY "Admins or authors can delete posts" ON posts
  FOR DELETE USING (is_admin() OR author_id = auth.uid());

-- Notifications: כל משתמש קורא ומעדכן רק את ההתראות שלו
CREATE POLICY "Users access own notifications" ON notifications
  FOR ALL USING (user_id = auth.uid());

-- נתוני Seed ראשוניים להגדרות המועדון
INSERT INTO club_settings (id, club_name, default_max_participants, who_can_create_sails, cancellation_deadline_hours)
VALUES (1, 'מועדון שייט גלי ים', 6, 'admin_only', 12)
ON CONFLICT (id) DO NOTHING;
