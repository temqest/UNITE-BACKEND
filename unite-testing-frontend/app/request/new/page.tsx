"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function NewRequestRedirect() {
	const router = useRouter();
	useEffect(() => {
		// Redirect the legacy /request/new route to /request which contains the form.
		router.replace('/request');
	}, [router]);
	return null;
}
