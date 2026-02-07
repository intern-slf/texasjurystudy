import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  UserCredential 
} from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { firebaseAuth } from "./firebase";
import { supabase } from "./supabase/client";

const googleProvider = new GoogleAuthProvider();

export const googleLogin = async (): Promise<UserCredential> => {
  try {
    // 1. Authenticate with Firebase
    const result = await signInWithPopup(firebaseAuth, googleProvider);
    const user = result.user;

    // 2. Retrieve the Firebase ID Token
    const idToken = await user.getIdToken();

    // 3. Hand off the token to Supabase
    // This creates the user record in Supabase if it doesn't exist (Signup)
    // Or starts a session if it does (Login)
    const { error: supabaseError } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });

    if (supabaseError) throw supabaseError;

    return result;
  } catch (error) {
    if (error instanceof FirebaseError) {
      console.error("Firebase Auth Error:", error.code);
    } else {
      console.error("Supabase Sync Error:", error);
    }
    throw error;
  }
};