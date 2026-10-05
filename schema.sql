-- ==============================================================================
-- מועדון שייט - סכמת בסיס נתונים מלאה ל-Supabase / PostgreSQL
--
-- הרצה: Supabase → SQL Editor → New Query → הדבקת כל הקובץ → Run (פעם אחת, על פרויקט ריק).
--
-- עקרונות:
--   * כל פעולה שנוגעת בנתונים של משתמש אחר (קרדיטים, רשימת המתנה, התראות, אישור חברים)
--     מתבצעת בפונקציות SECURITY DEFINER (RPC) שבודקות הרשאות בעצמן ונועלות שורות (FOR UPDATE).
--   * כל הטבלאות מוגנות ב-RLS. כתיבה ישירה מהדפדפן מותרת רק לפעולות "פשוטות" על נתונים של המשתמש עצמו.
--   * משתמש רגיל לא יכול לשנות לעצמו תפקיד / סטטוס / קרדיטים (טריגר protect_profile_columns).
-- ==============================================================================

-- 1. טיפוסי ENUM
CREATE TYPE user_role AS ENUM ('admin', 'assistant', 'member');
CREATE TYPE user_status AS ENUM ('pending', 'approved', 'rejected', 'suspended');
CREATE TYPE sail_status AS ENUM ('open', 'closed', 'cancelled', 'completed');
CREATE TYPE sail_type AS ENUM ('club', 'private');
CREATE TYPE registration_status AS ENUM ('confirmed', 'waitlist', 'cancelled');
CREATE TYPE sail_creation_policy AS ENUM ('admin_only', 'all_members');
CREATE TYPE boat_status AS ENUM ('available', 'unavailable', 'maintenance');
CREATE TYPE issue_severity AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE issue_status AS ENUM ('open', 'in_progress', 'resolved');

-- ==============================================================================
-- 2. טבלאות
-- ==============================================================================

-- הגדרות מועדון (שורה יחידה)
CREATE TABLE club_settings (
  id INT PRIMARY KEY DEFAULT 1,
  club_name TEXT NOT NULL DEFAULT 'מועדון שייט גלי ים',
  logo_url TEXT DEFAULT '/icon.svg',
  default_max_participants INT NOT NULL DEFAULT 6,
  who_can_create_sails sail_creation_policy NOT NULL DEFAULT 'all_members',
  cancellation_deadline_hours INT NOT NULL DEFAULT 12,
  -- רמות ההסמכה שהמועדון מציע (ניתנות לעריכה בהגדרות), מהגבוהה לנמוכה
  experience_levels TEXT[] NOT NULL DEFAULT ARRAY[
    'משיט 60 (סקיפר בינלאומי)', 'משיט 30 (סקיפר חופי)', 'משיט 40 (סקיפר מסחרי)',
    'איש צוות מנוסה', 'סקיפר מתלמד', 'חובב / מתחיל'
  ],
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT single_row_settings CHECK (id = 1)
);

-- פרופילים (מקושרים ל-auth.users של Supabase, נוצרים אוטומטית בהרשמה)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  experience_level TEXT NOT NULL DEFAULT 'איש צוות מנוסה',
  role user_role NOT NULL DEFAULT 'member',
  status user_status NOT NULL DEFAULT 'pending',
  credits INT NOT NULL DEFAULT 5 CHECK (credits >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_profiles_status ON profiles(status);
CREATE INDEX idx_profiles_role ON profiles(role);

-- כלי שייט
CREATE TABLE boats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  model TEXT NOT NULL,
  status boat_status NOT NULL DEFAULT 'available',
  status_notes TEXT,
  berth_location TEXT DEFAULT 'מרינה הרצליה',
  year INT,
  capacity INT NOT NULL DEFAULT 8,
  -- מי רשאי להוציא את הסירה (סקיפר בהפלגת מועדון / פותח הפלגה פרטית). שתי הרשימות ריקות = כולם.
  allowed_levels TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  allowed_member_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- דיווחי תקלות
CREATE TABLE boat_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  boat_id UUID NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'אחר',
  severity issue_severity NOT NULL DEFAULT 'medium',
  status issue_status NOT NULL DEFAULT 'open',
  photo_url TEXT,
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX idx_boat_issues_boat ON boat_issues(boat_id, status);

-- הפלגות
CREATE TABLE sails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  sail_type sail_type NOT NULL DEFAULT 'club',
  date DATE NOT NULL,
  departure_time TIME NOT NULL,
  estimated_return_time TIME NOT NULL,
  duration_hours NUMERIC(4, 1) NOT NULL DEFAULT 3,
  boat_name TEXT NOT NULL,
  boat_id UUID REFERENCES boats(id) ON DELETE SET NULL,
  skipper_name TEXT NOT NULL,
  skipper_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  departure_point TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
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
CREATE INDEX idx_sails_boat_date ON sails(boat_id, date);

-- הרשמות להפלגה (מאושרים + רשימת המתנה)
CREATE TABLE sail_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sail_id UUID NOT NULL REFERENCES sails(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status registration_status NOT NULL DEFAULT 'confirmed',
  waitlist_position INT,
  credits_charged INT NOT NULL DEFAULT 0,
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  CONSTRAINT unique_sail_user UNIQUE (sail_id, user_id)
);

CREATE INDEX idx_registrations_sail ON sail_registrations(sail_id, status);
CREATE INDEX idx_registrations_user ON sail_registrations(user_id);

-- תמונות מהפלגות
CREATE TABLE sail_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sail_id UUID NOT NULL REFERENCES sails(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  caption TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sail_photos_sail ON sail_photos(sail_id);

-- פיד קהילה
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  images TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  link_preview JSONB,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  sail_id UUID REFERENCES sails(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_posts_created ON posts(created_at DESC);

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

CREATE INDEX idx_post_comments_post ON post_comments(post_id);

-- התראות
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  target_id TEXT,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, read);

-- ==============================================================================
-- 3. פונקציות עזר
-- ==============================================================================

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin' AND status = 'approved'
  );
$$;

CREATE OR REPLACE FUNCTION is_approved_member()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND status = 'approved'
  );
$$;

-- צוות הנהלה: מנהל או עוזר מנהל. עוזר מנהל עושה כל מה שמנהל עושה, חוץ מקרדיטים, תפקידים
-- ופעולות על חשבונות של מנהלים/עוזרים אחרים.
CREATE OR REPLACE FUNCTION is_staff()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'assistant') AND status = 'approved'
  );
$$;

-- יצירת התראה (פנימי בלבד - לא נגיש מהדפדפן)
CREATE OR REPLACE FUNCTION _notify(
  p_user_id UUID, p_type TEXT, p_title TEXT, p_message TEXT, p_target_id TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  INSERT INTO notifications (user_id, type, title, message, target_id)
  VALUES (p_user_id, p_type, p_title, p_message, p_target_id);
$$;

-- מניין המנהלים הפעילים (להגנה מפני הסרת המנהל האחרון)
CREATE OR REPLACE FUNCTION _active_admin_count()
RETURNS INT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COUNT(*)::INT FROM profiles WHERE role = 'admin' AND status = 'approved';
$$;

-- ==============================================================================
-- 4. טריגרים
-- ==============================================================================

-- יצירת פרופיל אוטומטית בהרשמה. המשתמש הראשון במערכת הופך למנהל מאושר.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_first BOOLEAN;
  v_base_username TEXT;
  v_username TEXT;
  v_suffix INT := 1;
  v_full_name TEXT;
  v_admin RECORD;
BEGIN
  -- נעילה למניעת מצב שבו שני "משתמשים ראשונים" נרשמים במקביל
  LOCK TABLE profiles IN SHARE ROW EXCLUSIVE MODE;
  v_is_first := NOT EXISTS (SELECT 1 FROM profiles);

  v_base_username := lower(split_part(NEW.email, '@', 1));
  v_username := v_base_username;
  WHILE EXISTS (SELECT 1 FROM profiles WHERE username = v_username) LOOP
    v_suffix := v_suffix + 1;
    v_username := v_base_username || v_suffix;
  END LOOP;

  v_full_name := COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''), v_base_username);

  INSERT INTO profiles (id, email, username, full_name, phone, avatar_url, experience_level, role, status, credits)
  VALUES (
    NEW.id,
    lower(NEW.email),
    v_username,
    v_full_name,
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', 'https://api.dicebear.com/7.x/bottts/svg?seed=' || v_username),
    COALESCE(NEW.raw_user_meta_data->>'experience_level', 'איש צוות מנוסה'),
    CASE WHEN v_is_first THEN 'admin'::user_role ELSE 'member'::user_role END,
    CASE WHEN v_is_first THEN 'approved'::user_status ELSE 'pending'::user_status END,
    CASE WHEN v_is_first THEN 20 ELSE 5 END
  );

  IF NOT v_is_first THEN
    FOR v_admin IN SELECT id FROM profiles WHERE role IN ('admin', 'assistant') AND status = 'approved' LOOP
      PERFORM _notify(
        v_admin.id, 'member_request', 'בקשת הצטרפות חדשה למועדון',
        v_full_name || ' (' || lower(NEW.email) || ') נרשם וממתין לאישורך.'
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- הגנה על עמודות רגישות: עדכון ישיר מהדפדפן (תפקיד authenticated) של role/status/credits/email/username
-- מותר רק למנהל. פונקציות ה-RPC רצות כבעלי הסכמה ולכן אינן נחסמות.
CREATE OR REPLACE FUNCTION protect_profile_columns()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    -- תפקיד וקרדיטים: מנהל בלבד
    IF NOT is_admin() AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.credits IS DISTINCT FROM OLD.credits) THEN
      RAISE EXCEPTION 'אין הרשאה לשנות תפקיד או קרדיטים' USING ERRCODE = '42501';
    END IF;
    -- סטטוס, מייל ושם משתמש: צוות הנהלה בלבד
    IF NOT is_staff() AND (
      NEW.status IS DISTINCT FROM OLD.status
      OR NEW.email IS DISTINCT FROM OLD.email
      OR NEW.username IS DISTINCT FROM OLD.username
    ) THEN
      RAISE EXCEPTION 'אין הרשאה לשנות שדות אלה' USING ERRCODE = '42501';
    END IF;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_protect_columns
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profile_columns();

-- ==============================================================================
-- 5. פונקציות RPC - הפלגות והרשמות
-- ==============================================================================

-- הרשמה להפלגה (המשתמש המחובר), כולל בדיקת קרדיטים וחיוב, תחת נעילה אטומית
CREATE OR REPLACE FUNCTION join_sail(p_sail_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_sail RECORD;
  v_user RECORD;
  v_boat RECORD;
  v_existing RECORD;
  v_cost INT;
  v_confirmed INT;
  v_status registration_status;
  v_pos INT;
BEGIN
  IF NOT is_approved_member() THEN
    RETURN jsonb_build_object('success', false, 'message', 'רק חברים מאושרים יכולים להירשם להפלגות');
  END IF;

  SELECT * INTO v_sail FROM sails WHERE id = p_sail_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'הפלגה לא נמצאה');
  END IF;
  IF v_sail.status <> 'open' THEN
    RETURN jsonb_build_object('success', false, 'message', 'ההרשמה להפלגה זו סגורה או בוטלה');
  END IF;

  SELECT * INTO v_boat FROM boats
  WHERE name = v_sail.boat_name OR position(name IN v_sail.boat_name) > 0
  LIMIT 1;
  IF FOUND AND v_boat.status <> 'available' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'כלי השייט (' || v_boat.name || ') בסטטוס ' ||
        CASE WHEN v_boat.status = 'maintenance' THEN 'בהספנה / תיקון' ELSE 'לא זמין' END || ' כרגע.'
    );
  END IF;

  SELECT * INTO v_existing FROM sail_registrations
  WHERE sail_id = p_sail_id AND user_id = v_uid AND status <> 'cancelled';
  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'status', v_existing.status,
      'message', CASE WHEN v_existing.status = 'confirmed' THEN 'הנך כבר רשום להפלגה זו!' ELSE 'הנך כבר ברשימת ההמתנה להפלגה זו!' END
    );
  END IF;

  SELECT * INTO v_user FROM profiles WHERE id = v_uid FOR UPDATE;
  v_cost := CASE WHEN v_sail.sail_type = 'club' THEN 1 ELSE v_sail.credit_cost END;
  IF v_user.credits < v_cost THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'אין ברשותך מספיק נקודות קרדיט (נדרש: ' || v_cost || ', יתרה: ' || v_user.credits ||
        '). פנה למנהל המועדון להטענת קרדיטים.'
    );
  END IF;

  SELECT COUNT(*) INTO v_confirmed FROM sail_registrations
  WHERE sail_id = p_sail_id AND status = 'confirmed';

  IF v_confirmed < v_sail.max_participants THEN
    v_status := 'confirmed';
    v_pos := NULL;
  ELSE
    v_status := 'waitlist';
    SELECT COALESCE(MAX(waitlist_position), 0) + 1 INTO v_pos
    FROM sail_registrations WHERE sail_id = p_sail_id AND status = 'waitlist';
  END IF;

  INSERT INTO sail_registrations (sail_id, user_id, status, waitlist_position, credits_charged, registered_at, confirmed_at)
  VALUES (
    p_sail_id, v_uid, v_status, v_pos,
    CASE WHEN v_status = 'confirmed' THEN v_cost ELSE 0 END,
    NOW(),
    CASE WHEN v_status = 'confirmed' THEN NOW() ELSE NULL END
  )
  ON CONFLICT (sail_id, user_id) DO UPDATE SET
    status = EXCLUDED.status,
    waitlist_position = EXCLUDED.waitlist_position,
    credits_charged = EXCLUDED.credits_charged,
    registered_at = EXCLUDED.registered_at,
    confirmed_at = EXCLUDED.confirmed_at;

  IF v_status = 'confirmed' THEN
    UPDATE profiles SET credits = credits - v_cost WHERE id = v_uid;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'status', v_status,
    'message', CASE
      WHEN v_status = 'confirmed' THEN 'נרשמת בהצלחה להפלגה! מקומך מובטח ⛵ (ירד קרדיט ' || v_cost || ')'
      ELSE 'ההפלגה מלאה. נכנסת לרשימת המתנה (מקום ' || v_pos || ' בתור). הקרדיט יחויב רק כשתעלה להפלגה.'
    END
  );
END;
$$;

-- ביטול הרשמה + החזר קרדיט + קידום אוטומטי של הראשון ברשימת ההמתנה.
-- p_user_id ריק = המשתמש המחובר. ביטול עבור משתמש אחר מותר למנהל בלבד (ועוקף את חלון הביטול).
CREATE OR REPLACE FUNCTION cancel_registration(p_sail_id UUID, p_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := COALESCE(p_user_id, auth.uid());
  v_is_admin BOOLEAN := is_staff();
  v_sail RECORD;
  v_reg RECORD;
  v_next RECORD;
  v_deadline INT;
  v_hours_left NUMERIC;
  v_promoted UUID;
BEGIN
  IF v_uid IS DISTINCT FROM auth.uid() AND NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'message', 'אין הרשאה לבטל הרשמה של חבר אחר');
  END IF;

  SELECT * INTO v_sail FROM sails WHERE id = p_sail_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'הפלגה לא נמצאה');
  END IF;

  SELECT * INTO v_reg FROM sail_registrations
  WHERE sail_id = p_sail_id AND user_id = v_uid AND status <> 'cancelled'
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'לא נמצאה הרשמה פעילה להפלגה זו');
  END IF;

  IF NOT v_is_admin THEN
    SELECT cancellation_deadline_hours INTO v_deadline FROM club_settings WHERE id = 1;
    -- שעות ההפלגה נשמרות בשעון ישראל
    v_hours_left := EXTRACT(EPOCH FROM (((v_sail.date + v_sail.departure_time) AT TIME ZONE 'Asia/Jerusalem') - NOW())) / 3600;
    IF v_hours_left < v_deadline AND v_hours_left > 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', 'נעילת ביטול: לא ניתן לבטל פחות מ-' || v_deadline || ' שעות לפני היציאה. פנה למנהל המועדון.'
      );
    END IF;
  END IF;

  UPDATE sail_registrations SET status = 'cancelled', waitlist_position = NULL WHERE id = v_reg.id;

  IF v_reg.status = 'confirmed' THEN
    IF v_reg.credits_charged > 0 THEN
      UPDATE profiles SET credits = credits + v_reg.credits_charged WHERE id = v_uid;
    END IF;

    IF v_sail.sail_type = 'club' THEN
      SELECT * INTO v_next FROM sail_registrations
      WHERE sail_id = p_sail_id AND status = 'waitlist'
      ORDER BY waitlist_position ASC
      LIMIT 1
      FOR UPDATE;

      IF FOUND THEN
        v_promoted := v_next.user_id;
        UPDATE sail_registrations
        SET status = 'confirmed', waitlist_position = NULL, credits_charged = 1, confirmed_at = NOW()
        WHERE id = v_next.id;
        UPDATE profiles SET credits = GREATEST(0, credits - 1) WHERE id = v_next.user_id;
        UPDATE sail_registrations SET waitlist_position = waitlist_position - 1
        WHERE sail_id = p_sail_id AND status = 'waitlist';

        PERFORM _notify(
          v_next.user_id, 'waitlist_promoted', '🎉 מקום התפנה בהפלגה! עלית מרשימת ההמתנה!',
          'מישהו ביטל את השתתפותו בהפלגה "' || v_sail.title || '" (' || v_sail.date || '). מקומך אושר אוטומטית! (חויב קרדיט 1)',
          p_sail_id::TEXT
        );
      END IF;
    END IF;
  ELSE
    UPDATE sail_registrations SET waitlist_position = waitlist_position - 1
    WHERE sail_id = p_sail_id AND status = 'waitlist' AND waitlist_position > v_reg.waitlist_position;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'promoted_user_id', v_promoted,
    'message', CASE WHEN v_reg.status = 'confirmed'
      THEN 'ביטול ההשתתפות בוצע בהצלחה ונקודות הקרדיט הוחזרו.'
      ELSE 'הוסרת מרשימת ההמתנה.' END
  );
END;
$$;

-- האם חבר רשאי להוציא את הסירה (לפי האנשים / רמות ההסמכה שהוגדרו לה)
CREATE OR REPLACE FUNCTION _may_take_boat(p_boat boats, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT (cardinality(p_boat.allowed_levels) = 0 AND cardinality(p_boat.allowed_member_ids) = 0)
    OR p_user_id = ANY (p_boat.allowed_member_ids)
    OR EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id AND experience_level = ANY (p_boat.allowed_levels));
$$;

-- יצירת הפלגה: בהפלגה פרטית היוצר מחויב ונרשם, בהפלגת מועדון הסקיפר נרשם בחינם. כל החברים מקבלים התראה.
CREATE OR REPLACE FUNCTION create_sail(p_sail JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_policy sail_creation_policy;
  v_sail sails;
  v_member RECORD;
  v_boat boats;
  v_type sail_type := COALESCE(p_sail->>'sailType', 'club')::sail_type;
  v_skipper UUID := NULLIF(p_sail->>'skipperId', '')::UUID;
  v_date DATE := (p_sail->>'date')::DATE;
  v_dep TIME := (p_sail->>'departureTime')::TIME;
  v_ret TIME := (p_sail->>'estimatedReturnTime')::TIME;
  v_conflict RECORD;
  v_taker UUID;
BEGIN
  SELECT who_can_create_sails INTO v_policy FROM club_settings WHERE id = 1;
  IF NOT (is_staff() OR (is_approved_member() AND v_policy = 'all_members')) THEN
    RETURN jsonb_build_object('success', false, 'message', 'אין לך הרשאה לפתוח הפלגות');
  END IF;

  -- הסירה: לפי מזהה, ולתאימות לאחור לפי השם שבתווית ("גלית (Bavaria 38)")
  SELECT * INTO v_boat FROM boats
  WHERE id = NULLIF(p_sail->>'boatId', '')::UUID
     OR (NULLIF(p_sail->>'boatId', '') IS NULL
         AND (name = p_sail->>'boatName' OR p_sail->>'boatName' LIKE name || ' (%'))
  LIMIT 1
  FOR UPDATE; -- נעילה: שתי פתיחות במקביל לאותה סירה לא יעברו שתיהן את בדיקת החפיפה

  IF FOUND THEN
    -- אין שתי הפלגות לאותה סירה בשעות חופפות (חזרה לפני היציאה = עד חצות)
    SELECT * INTO v_conflict FROM sails
    WHERE boat_id = v_boat.id AND date = v_date AND status <> 'cancelled'
      AND departure_time < (CASE WHEN v_ret > v_dep THEN v_ret ELSE TIME '23:59:59' END)
      AND v_dep < (CASE WHEN estimated_return_time > departure_time THEN estimated_return_time ELSE TIME '23:59:59' END)
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', v_boat.name || ' כבר תפוסה בשעות האלה: "' || v_conflict.title || '" (' ||
          to_char(v_conflict.departure_time, 'HH24:MI') || '–' || to_char(v_conflict.estimated_return_time, 'HH24:MI') ||
          '). בחר שעה או סירה אחרת.'
      );
    END IF;

    -- הרשאת הוצאת הסירה: הסקיפר בהפלגת מועדון, הפותח בהפלגה פרטית
    v_taker := CASE WHEN v_type = 'private' THEN v_uid ELSE v_skipper END;
    IF v_taker IS NULL THEN
      -- סקיפר אורח: רק צוות ההנהלה רשאי לשבץ אותו בסירה מוגבלת
      IF (cardinality(v_boat.allowed_levels) > 0 OR cardinality(v_boat.allowed_member_ids) > 0) AND NOT is_staff() THEN
        RETURN jsonb_build_object('success', false, 'message', 'הסירה ' || v_boat.name || ' מוגבלת לסקיפרים מורשים; בחר סקיפר מורשה');
      END IF;
    ELSIF NOT _may_take_boat(v_boat, v_taker) THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', CASE WHEN v_type = 'private'
          THEN 'אין לך הרשאה להוציא את ' || v_boat.name || '. פנה להנהלת המועדון.'
          ELSE 'הסקיפר שנבחר אינו מורשה להוציא את ' || v_boat.name || '.' END
      );
    END IF;
  END IF;

  INSERT INTO sails (
    title, sail_type, date, departure_time, estimated_return_time, duration_hours,
    boat_name, boat_id, skipper_name, skipper_id, departure_point, notes,
    min_participants, max_participants, credit_cost, status, created_by
  ) VALUES (
    p_sail->>'title',
    v_type,
    v_date,
    v_dep,
    v_ret,
    COALESCE((p_sail->>'durationHours')::NUMERIC, 3),
    p_sail->>'boatName',
    v_boat.id,
    p_sail->>'skipperName',
    v_skipper,
    p_sail->>'departurePoint',
    COALESCE(p_sail->>'notes', ''),
    COALESCE((p_sail->>'minParticipants')::INT, 3),
    COALESCE((p_sail->>'maxParticipants')::INT, 6),
    COALESCE((p_sail->>'creditCost')::INT, 1),
    COALESCE(p_sail->>'status', 'open')::sail_status,
    v_uid
  )
  RETURNING * INTO v_sail;

  IF v_sail.sail_type = 'private' THEN
    UPDATE profiles SET credits = GREATEST(0, credits - v_sail.credit_cost) WHERE id = v_uid;
    INSERT INTO sail_registrations (sail_id, user_id, status, credits_charged, confirmed_at)
    VALUES (v_sail.id, v_uid, 'confirmed', v_sail.credit_cost, NOW());
  ELSIF v_sail.skipper_id IS NOT NULL THEN
    INSERT INTO sail_registrations (sail_id, user_id, status, credits_charged, confirmed_at)
    VALUES (v_sail.id, v_sail.skipper_id, 'confirmed', 0, NOW());
  END IF;

  FOR v_member IN SELECT id FROM profiles WHERE status = 'approved' AND id <> v_uid LOOP
    PERFORM _notify(
      v_member.id, 'new_sail',
      '⛵ ' || CASE WHEN v_sail.sail_type = 'private' THEN 'הפלגה פרטית' ELSE 'הפלגת מועדון' END || ' נפתחה!',
      v_sail.title || ' בתאריך ' || v_sail.date || ' בשעה ' || to_char(v_sail.departure_time, 'HH24:MI') ||
        ' (סקיפר: ' || v_sail.skipper_name || ')',
      v_sail.id::TEXT
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'sail_id', v_sail.id);
END;
$$;

-- ביטול הפלגה ע"י מנהל או יוצר ההפלגה: החזר קרדיטים מלא והתראה לכל הרשומים
CREATE OR REPLACE FUNCTION cancel_sail(p_sail_id UUID, p_reason TEXT DEFAULT '')
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sail RECORD;
  v_reg RECORD;
  v_actor TEXT;
BEGIN
  SELECT * INTO v_sail FROM sails WHERE id = p_sail_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'הפלגה לא נמצאה');
  END IF;
  IF NOT (is_staff() OR v_sail.created_by = auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'message', 'אין הרשאה לבטל הפלגה זו');
  END IF;
  IF v_sail.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'message', 'ההפלגה כבר בוטלה');
  END IF;

  SELECT full_name INTO v_actor FROM profiles WHERE id = auth.uid();

  UPDATE sails SET status = 'cancelled', cancellation_reason = NULLIF(p_reason, '') WHERE id = p_sail_id;

  FOR v_reg IN
    SELECT * FROM sail_registrations WHERE sail_id = p_sail_id AND status <> 'cancelled' FOR UPDATE
  LOOP
    IF v_reg.status = 'confirmed' AND v_reg.credits_charged > 0 THEN
      UPDATE profiles SET credits = credits + v_reg.credits_charged WHERE id = v_reg.user_id;
    END IF;
    PERFORM _notify(
      v_reg.user_id, 'sail_cancelled', '⚠️ הפלגה בוטלה ע״י מנהל',
      'ההפלגה "' || v_sail.title || '" (' || v_sail.date || ') בוטלה ע"י ' || COALESCE(v_actor, 'הנהלת המועדון') ||
        '. סיבה: ' || COALESCE(NULLIF(p_reason, ''), 'לא צוינה סיבה') || '.' ||
        CASE WHEN v_reg.status = 'confirmed' AND v_reg.credits_charged > 0
          THEN ' הוחזרו ' || v_reg.credits_charged || ' נקודות קרדיט.' ELSE '' END,
      p_sail_id::TEXT
    );
  END LOOP;

  UPDATE sail_registrations SET status = 'cancelled', waitlist_position = NULL, credits_charged = 0
  WHERE sail_id = p_sail_id AND status <> 'cancelled';

  RETURN jsonb_build_object('success', true, 'message', 'ההפלגה בוטלה');
END;
$$;

-- הוספת משתתף ידנית ע"י מנהל (ללא חיוב קרדיט)
CREATE OR REPLACE FUNCTION add_participant(p_sail_id UUID, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sail RECORD;
  v_name TEXT;
BEGIN
  IF NOT is_staff() THEN
    RETURN jsonb_build_object('success', false, 'message', 'פעולה זו מותרת למנהלים בלבד');
  END IF;

  SELECT * INTO v_sail FROM sails WHERE id = p_sail_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'הפלגה לא נמצאה');
  END IF;

  SELECT full_name INTO v_name FROM profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'חבר מועדון לא נמצא');
  END IF;

  IF EXISTS (SELECT 1 FROM sail_registrations WHERE sail_id = p_sail_id AND user_id = p_user_id AND status <> 'cancelled') THEN
    RETURN jsonb_build_object('success', false, 'message', 'משתמש זה כבר רשום להפלגה');
  END IF;

  INSERT INTO sail_registrations (sail_id, user_id, status, waitlist_position, credits_charged, registered_at, confirmed_at)
  VALUES (p_sail_id, p_user_id, 'confirmed', NULL, 0, NOW(), NOW())
  ON CONFLICT (sail_id, user_id) DO UPDATE SET
    status = 'confirmed', waitlist_position = NULL, credits_charged = 0, registered_at = NOW(), confirmed_at = NOW();

  PERFORM _notify(
    p_user_id, 'new_sail', '⛵ צורפת להפלגה ע״י מנהל',
    'צורפת להפלגה "' || v_sail.title || '" (' || v_sail.date || ') ע"י הנהלת המועדון.',
    p_sail_id::TEXT
  );

  RETURN jsonb_build_object('success', true, 'message', v_name || ' נוסף בהצלחה להפלגה!');
END;
$$;

-- ==============================================================================
-- 6. פונקציות RPC - ניהול חברים (מנהלים בלבד)
-- ==============================================================================

CREATE OR REPLACE FUNCTION approve_member(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_staff() THEN
    RETURN jsonb_build_object('success', false, 'message', 'פעולה זו מותרת למנהלים בלבד');
  END IF;
  UPDATE profiles SET status = 'approved' WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'משתמש לא נמצא');
  END IF;
  PERFORM _notify(
    p_user_id, 'member_approved', 'ברוך הבא למועדון השייט! 🎉',
    'הנהלת המועדון אישרה את חברותך. כעת באפשרותך להצטרף להפלגות ולפרסם בפיד.'
  );
  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION reject_member(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_staff() THEN
    RETURN jsonb_build_object('success', false, 'message', 'פעולה זו מותרת למנהלים בלבד');
  END IF;
  IF (SELECT role FROM profiles WHERE id = p_user_id) <> 'member' AND NOT is_admin() THEN
    RETURN jsonb_build_object('success', false, 'message', 'רק מנהל יכול לדחות מנהל או עוזר מנהל');
  END IF;
  IF (SELECT role FROM profiles WHERE id = p_user_id) = 'admin' AND _active_admin_count() <= 1 THEN
    RETURN jsonb_build_object('success', false, 'message', 'לא ניתן לדחות את המנהל האחרון במערכת!');
  END IF;
  UPDATE profiles SET status = 'rejected' WHERE id = p_user_id;
  RETURN jsonb_build_object('success', FOUND);
END;
$$;

CREATE OR REPLACE FUNCTION set_member_role(p_user_id UUID, p_role user_role)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_current user_role;
BEGIN
  IF NOT is_admin() THEN
    RETURN jsonb_build_object('success', false, 'message', 'פעולה זו מותרת למנהלים בלבד');
  END IF;
  SELECT role INTO v_current FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'משתמש לא נמצא');
  END IF;
  IF v_current = 'admin' AND p_role <> 'admin' AND _active_admin_count() <= 1 THEN
    RETURN jsonb_build_object('success', false, 'message', 'לא ניתן להוריד מנהל זה: חייב להישאר לפחות מנהל אחד פעיל במועדון!');
  END IF;
  UPDATE profiles SET role = p_role WHERE id = p_user_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION set_member_qualification(p_user_id UUID, p_level TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_staff() THEN
    RETURN jsonb_build_object('success', false, 'message', 'פעולה זו מותרת למנהלים בלבד');
  END IF;
  UPDATE profiles SET experience_level = p_level WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'משתמש לא נמצא');
  END IF;
  PERFORM _notify(
    p_user_id, 'member_approved', '🎖️ עודכנה רמת הסמכת השייט שלך',
    'הנהלת המועדון עדכנה את רמת הסמכתך ל: ' || p_level || '.'
  );
  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION update_member_credits(p_user_id UUID, p_delta INT, p_reason TEXT DEFAULT '')
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_new INT;
  v_actor TEXT;
BEGIN
  IF NOT is_admin() THEN
    RETURN jsonb_build_object('success', false, 'message', 'פעולה זו מותרת למנהלים בלבד');
  END IF;
  UPDATE profiles SET credits = GREATEST(0, credits + p_delta) WHERE id = p_user_id
  RETURNING credits INTO v_new;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'משתמש לא נמצא', 'new_credits', 0);
  END IF;

  SELECT full_name INTO v_actor FROM profiles WHERE id = auth.uid();
  PERFORM _notify(
    p_user_id, 'credit_update',
    CASE WHEN p_delta >= 0 THEN '🪙 נוספו לך ' || p_delta || ' נקודות קרדיט!'
      ELSE '🪙 הופחתו ' || abs(p_delta) || ' נקודות קרדיט' END,
    v_actor || ' עדכן/ה את מאזן הקרדיטים שלך. ' ||
      CASE WHEN COALESCE(p_reason, '') <> '' THEN 'סיבה: ' || p_reason || '. ' ELSE '' END ||
      'יתרה עדכנית: ' || v_new || ' קרדיטים.'
  );
  RETURN jsonb_build_object('success', true, 'new_credits', v_new);
END;
$$;

-- מחיקת חבר מתבצעת ב-Edge Function בשם admin-actions (supabase/functions/admin-actions),
-- דרך ה-Admin API הרשמי של Supabase (auth.admin.deleteUser) ולא ב-SQL.

-- שינוי שם של רמת הסמכה: מעדכן את רשימת המועדון ואת כל החברים שמחזיקים בה
CREATE OR REPLACE FUNCTION rename_experience_level(p_old TEXT, p_new TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  IF NOT is_staff() THEN
    RETURN jsonb_build_object('success', false, 'message', 'פעולה זו מותרת לצוות ההנהלה בלבד');
  END IF;
  IF trim(COALESCE(p_new, '')) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'יש להזין שם לרמת ההסמכה');
  END IF;
  UPDATE club_settings SET experience_levels = array_replace(experience_levels, p_old, trim(p_new)), updated_at = NOW()
  WHERE id = 1;
  UPDATE profiles SET experience_level = trim(p_new) WHERE experience_level = p_old;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'members_updated', v_count);
END;
$$;

-- ==============================================================================
-- 7. פונקציות RPC - כלי שייט ותקלות
-- ==============================================================================

CREATE OR REPLACE FUNCTION report_boat_issue(
  p_boat_id UUID, p_title TEXT, p_description TEXT, p_category TEXT,
  p_severity issue_severity, p_photo_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_issue_id UUID;
  v_boat_name TEXT;
  v_reporter TEXT;
  v_member RECORD;
BEGIN
  IF NOT is_approved_member() THEN
    RETURN jsonb_build_object('success', false, 'message', 'רק חברים מאושרים יכולים לדווח על תקלות');
  END IF;
  SELECT name INTO v_boat_name FROM boats WHERE id = p_boat_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'כלי השייט לא נמצא');
  END IF;
  SELECT full_name INTO v_reporter FROM profiles WHERE id = auth.uid();

  INSERT INTO boat_issues (boat_id, reporter_id, title, description, category, severity, photo_url)
  VALUES (p_boat_id, auth.uid(), p_title, p_description, p_category, p_severity, p_photo_url)
  RETURNING id INTO v_issue_id;

  IF p_severity = 'critical' THEN
    UPDATE boats SET status = 'maintenance', status_notes = 'תקלה משביתה: ' || p_title WHERE id = p_boat_id;
  END IF;

  FOR v_member IN SELECT id FROM profiles WHERE status = 'approved' LOOP
    PERFORM _notify(
      v_member.id, 'boat_issue', '🚨 דיווח תקלה: ' || v_boat_name,
      v_reporter || ' דיווח על: "' || p_title || '" (' || p_category || ')'
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'issue_id', v_issue_id);
END;
$$;

CREATE OR REPLACE FUNCTION update_boat_issue_status(p_issue_id UUID, p_status issue_status, p_admin_notes TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_issue RECORD;
BEGIN
  IF NOT is_staff() THEN
    RETURN jsonb_build_object('success', false, 'message', 'פעולה זו מותרת למנהלים בלבד');
  END IF;
  SELECT * INTO v_issue FROM boat_issues WHERE id = p_issue_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'התקלה לא נמצאה');
  END IF;

  UPDATE boat_issues SET
    status = p_status,
    admin_notes = COALESCE(p_admin_notes, admin_notes),
    resolved_at = CASE WHEN p_status = 'resolved' THEN NOW() ELSE NULL END,
    resolved_by = CASE WHEN p_status = 'resolved' THEN auth.uid() ELSE NULL END
  WHERE id = p_issue_id;

  IF p_status = 'resolved' AND NOT EXISTS (
    SELECT 1 FROM boat_issues
    WHERE boat_id = v_issue.boat_id AND status <> 'resolved' AND severity = 'critical'
  ) THEN
    UPDATE boats SET status = 'available', status_notes = 'תוקנה וחזרה לכשירות'
    WHERE id = v_issue.boat_id AND status = 'maintenance';
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- איפוס נתוני פעילות (הפלגות, פוסטים, תקלות, התראות) מתבצע גם הוא ב-Edge Function admin-actions.

-- פונקציות פנימיות - לא נגישות מהדפדפן
REVOKE EXECUTE ON FUNCTION _notify(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION _active_admin_count() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION _may_take_boat(boats, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION handle_new_user() FROM PUBLIC, anon, authenticated;

-- פונקציות ה-RPC זמינות רק למשתמשים מחוברים (כל אחת בודקת בעצמה את הרשאות הקורא)
DO $$
DECLARE
  f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'is_admin()', 'is_staff()', 'is_approved_member()', 'rename_experience_level(text, text)',
    'join_sail(uuid)', 'cancel_registration(uuid, uuid)', 'create_sail(jsonb)', 'cancel_sail(uuid, text)',
    'add_participant(uuid, uuid)', 'approve_member(uuid)', 'reject_member(uuid)',
    'set_member_role(uuid, user_role)', 'set_member_qualification(uuid, text)',
    'update_member_credits(uuid, integer, text)',
    'report_boat_issue(uuid, text, text, text, issue_severity, text)',
    'update_boat_issue_status(uuid, issue_status, text)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END;
$$;

-- ==============================================================================
-- 8. Row Level Security
-- ==============================================================================
ALTER TABLE club_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE boats ENABLE ROW LEVEL SECURITY;
ALTER TABLE boat_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE sails ENABLE ROW LEVEL SECURITY;
ALTER TABLE sail_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sail_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- הגדרות: כולם קוראים (שם המועדון מוצג במסך הכניסה), מנהל מעדכן
CREATE POLICY "settings_select" ON club_settings FOR SELECT USING (TRUE);
CREATE POLICY "settings_update_staff" ON club_settings FOR UPDATE USING (is_staff());

-- פרופילים: חברים מאושרים רואים את כולם, כל אחד רואה ועורך את עצמו, מנהל מנהל הכל
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (is_approved_member() OR id = auth.uid());
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_admin_all" ON profiles FOR ALL USING (is_admin());
-- עוזר מנהל מעדכן פרופילים של חברים רגילים בלבד (תפקיד וקרדיטים חסומים בטריגר)
CREATE POLICY "profiles_staff_update_members" ON profiles FOR UPDATE USING (is_staff() AND role = 'member') WITH CHECK (role = 'member');

-- כלי שייט: חברים רואים, מנהל מנהל
CREATE POLICY "boats_select" ON boats FOR SELECT USING (is_approved_member());
CREATE POLICY "boats_staff_all" ON boats FOR ALL USING (is_staff()) WITH CHECK (is_staff());

-- תקלות: חברים רואים (לוח מודעות פומבי). יצירה ועדכון דרך RPC.
CREATE POLICY "issues_select" ON boat_issues FOR SELECT USING (is_approved_member());

-- הפלגות: חברים רואים. יצירה וביטול דרך RPC. עריכה (נעילת הרשמה וכו') למנהל או ליוצר.
CREATE POLICY "sails_select" ON sails FOR SELECT USING (is_approved_member());
CREATE POLICY "sails_update" ON sails FOR UPDATE USING (is_staff() OR created_by = auth.uid());
CREATE POLICY "sails_delete_staff" ON sails FOR DELETE USING (is_staff());

-- הרשמות: חברים רואים. כל השינויים דרך RPC בלבד.
CREATE POLICY "registrations_select" ON sail_registrations FOR SELECT USING (is_approved_member());

-- תמונות הפלגה: חברים רואים ומעלים בשמם, מעלה התמונה או מנהל מוחקים
CREATE POLICY "photos_select" ON sail_photos FOR SELECT USING (is_approved_member());
CREATE POLICY "photos_insert_own" ON sail_photos FOR INSERT WITH CHECK (is_approved_member() AND user_id = auth.uid());
CREATE POLICY "photos_delete" ON sail_photos FOR DELETE USING (is_staff() OR user_id = auth.uid());

-- פוסטים: חברים רואים ומפרסמים בשמם, מנהל נועץ, מנהל או כותב מוחקים
CREATE POLICY "posts_select" ON posts FOR SELECT USING (is_approved_member());
CREATE POLICY "posts_insert_own" ON posts FOR INSERT WITH CHECK (is_approved_member() AND author_id = auth.uid());
CREATE POLICY "posts_update_staff" ON posts FOR UPDATE USING (is_staff());
CREATE POLICY "posts_delete" ON posts FOR DELETE USING (is_staff() OR author_id = auth.uid());

-- לייקים
CREATE POLICY "likes_select" ON post_likes FOR SELECT USING (is_approved_member());
CREATE POLICY "likes_insert_own" ON post_likes FOR INSERT WITH CHECK (is_approved_member() AND user_id = auth.uid());
CREATE POLICY "likes_delete_own" ON post_likes FOR DELETE USING (user_id = auth.uid());

-- תגובות
CREATE POLICY "comments_select" ON post_comments FOR SELECT USING (is_approved_member());
CREATE POLICY "comments_insert_own" ON post_comments FOR INSERT WITH CHECK (is_approved_member() AND author_id = auth.uid());
CREATE POLICY "comments_delete" ON post_comments FOR DELETE USING (is_staff() OR author_id = auth.uid());

-- התראות: כל משתמש רואה, מסמן כנקרא ומוחק רק את שלו. יצירה רק דרך פונקציות השרת.
CREATE POLICY "notifications_select_own" ON notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "notifications_update_own" ON notifications FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "notifications_delete_own" ON notifications FOR DELETE USING (user_id = auth.uid());

-- הרשאות גישה ל-API (ה-RLS שלמעלה קובע אילו שורות; כאן רק אילו פעולות בכלל אפשריות)
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON club_settings TO anon;

-- ==============================================================================
-- 9. Realtime - עדכונים חיים לכל המכשירים המחוברים
-- ==============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE
  club_settings, profiles, boats, boat_issues, sails, sail_registrations,
  sail_photos, posts, post_likes, post_comments, notifications;

-- ==============================================================================
-- 10. נתוני פתיחה
-- ==============================================================================
INSERT INTO club_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

INSERT INTO boats (name, model, status, status_notes, berth_location, year, capacity) VALUES
  ('גלית', 'Bavaria 38 Cruiser', 'available', 'תקינה לחלוטין ומוכנה להפלגות מועדון ופרטיות', 'מרינה הרצליה, רציף B', 2021, 8),
  ('רוח ים', 'Beneteau Oceanis 41', 'available', 'מאובזרת ומתוחזקת', 'מרינה תל אביב, רציף ראשי', 2022, 10),
  ('אלת הים', 'Jeanneau Sun Odyssey 349', 'maintenance', 'בהספנה שנתית - טיפול מנוע ואנטי-פאולינג', 'מרינה הרצליה, מספנה רציף C', 2020, 6);

-- ==============================================================================
-- 11. הצטרפות בקישור ובקשות קרדיטים
-- ==============================================================================

-- קישור הצטרפות: קוד סודי שהנהלה שולחת למצטרפים חדשים (טבלה נפרדת: הגדרות המועדון קריאות לכולם)
CREATE TABLE IF NOT EXISTS club_invite (
  id INT PRIMARY KEY DEFAULT 1,
  code TEXT NOT NULL DEFAULT replace(gen_random_uuid()::TEXT, '-', ''),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT single_row_invite CHECK (id = 1)
);
INSERT INTO club_invite (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- בקשות לקרדיטים נוספים: חבר מבקש, מנהל מאשר (עם כמות לבחירתו) או דוחה
CREATE TABLE IF NOT EXISTS credit_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount INT NOT NULL CHECK (amount BETWEEN 1 AND 100),
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  granted INT,
  handled_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  handled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_credit_requests_status ON credit_requests(status, created_at);
-- לכל חבר לכל היותר בקשה ממתינה אחת
CREATE UNIQUE INDEX IF NOT EXISTS uniq_credit_requests_pending ON credit_requests(user_id) WHERE status = 'pending';

ALTER TABLE club_invite ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "invite_select_staff" ON club_invite;
CREATE POLICY "invite_select_staff" ON club_invite FOR SELECT USING (is_staff());
DROP POLICY IF EXISTS "credit_requests_select" ON credit_requests;
CREATE POLICY "credit_requests_select" ON credit_requests FOR SELECT USING (user_id = auth.uid() OR is_admin());
-- כתיבה רק דרך פונקציות ה-RPC
REVOKE ALL ON club_invite, credit_requests FROM anon, authenticated;
GRANT SELECT ON club_invite, credit_requests TO authenticated;

-- חידוש הקוד מבטל את הקישור הקודם
CREATE OR REPLACE FUNCTION regenerate_invite_code()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_code TEXT;
BEGIN
  IF NOT is_staff() THEN
    RETURN jsonb_build_object('success', false, 'message', 'פעולה זו מותרת לצוות ההנהלה בלבד');
  END IF;
  UPDATE club_invite SET code = replace(gen_random_uuid()::TEXT, '-', ''), updated_at = NOW() WHERE id = 1
  RETURNING code INTO v_code;
  RETURN jsonb_build_object('success', true, 'code', v_code);
END;
$$;

CREATE OR REPLACE FUNCTION request_credits(p_amount INT, p_note TEXT DEFAULT '')
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_req credit_requests;
  v_me profiles;
  v_admin RECORD;
BEGIN
  SELECT * INTO v_me FROM profiles WHERE id = v_uid AND status = 'approved';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'רק חברים מאושרים יכולים לבקש קרדיטים');
  END IF;
  IF p_amount IS NULL OR p_amount < 1 OR p_amount > 100 THEN
    RETURN jsonb_build_object('success', false, 'message', 'יש לבקש בין 1 ל-100 קרדיטים');
  END IF;
  IF EXISTS (SELECT 1 FROM credit_requests WHERE user_id = v_uid AND status = 'pending') THEN
    RETURN jsonb_build_object('success', false, 'message', 'כבר יש לך בקשה ממתינה. ההנהלה תטפל בה בקרוב.');
  END IF;

  INSERT INTO credit_requests (user_id, amount, note)
  VALUES (v_uid, p_amount, left(COALESCE(trim(p_note), ''), 300))
  RETURNING * INTO v_req;

  FOR v_admin IN SELECT id FROM profiles WHERE role = 'admin' AND status = 'approved' LOOP
    PERFORM _notify(
      v_admin.id, 'credit_request', '🪙 בקשה לקרדיטים נוספים',
      v_me.full_name || ' מבקש/ת ' || p_amount || ' קרדיטים (יתרה נוכחית: ' || v_me.credits || ').' ||
        CASE WHEN v_req.note <> '' THEN ' "' || v_req.note || '"' ELSE '' END,
      v_req.id::TEXT
    );
  END LOOP;
  RETURN jsonb_build_object('success', true, 'request_id', v_req.id);
END;
$$;

CREATE OR REPLACE FUNCTION resolve_credit_request(p_request_id UUID, p_approve BOOLEAN, p_amount INT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_req credit_requests;
  v_grant INT;
  v_new INT;
BEGIN
  IF NOT is_admin() THEN
    RETURN jsonb_build_object('success', false, 'message', 'רק מנהל יכול לאשר קרדיטים');
  END IF;
  SELECT * INTO v_req FROM credit_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'הבקשה לא נמצאה');
  END IF;
  IF v_req.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'message', 'הבקשה כבר טופלה');
  END IF;

  IF p_approve THEN
    v_grant := COALESCE(p_amount, v_req.amount);
    IF v_grant < 1 OR v_grant > 100 THEN
      RETURN jsonb_build_object('success', false, 'message', 'יש לאשר בין 1 ל-100 קרדיטים');
    END IF;
    UPDATE profiles SET credits = credits + v_grant WHERE id = v_req.user_id RETURNING credits INTO v_new;
    UPDATE credit_requests SET status = 'approved', granted = v_grant, handled_by = auth.uid(), handled_at = NOW()
    WHERE id = p_request_id;
    PERFORM _notify(
      v_req.user_id, 'credit_update', '🪙 בקשת הקרדיטים אושרה!',
      'נוספו לך ' || v_grant || ' קרדיטים. יתרה עדכנית: ' || v_new || ' קרדיטים.'
    );
  ELSE
    UPDATE credit_requests SET status = 'rejected', handled_by = auth.uid(), handled_at = NOW()
    WHERE id = p_request_id;
    PERFORM _notify(
      v_req.user_id, 'credit_update', 'בקשת הקרדיטים לא אושרה',
      'הנהלת המועדון לא אישרה את בקשתך ל-' || v_req.amount || ' קרדיטים. לפרטים פנה להנהלה.'
    );
  END IF;

  -- ההתראה למנהלים על הבקשה מסומנת כנקראה
  UPDATE notifications SET read = TRUE WHERE type = 'credit_request' AND target_id = p_request_id::TEXT;
  RETURN jsonb_build_object('success', true, 'new_credits', v_new);
END;
$$;

REVOKE EXECUTE ON FUNCTION regenerate_invite_code() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION request_credits(INT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION resolve_credit_request(UUID, BOOLEAN, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION regenerate_invite_code() TO authenticated;
GRANT EXECUTE ON FUNCTION request_credits(INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_credit_request(UUID, BOOLEAN, INT) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE club_invite, credit_requests;
